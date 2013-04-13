/* Copyright (c) 2013 Wang Wenlin. See LICENSE for more information */

var events = require('events')
  , net = require('net')
  , util = require('util')
  , Parser = require('./mqtt/parser').Parser
  , generate = require('./mqtt/generate');

var MQTT_VERSION = 'MQIsdp'
  , MQTT_VERSION_NUM = 3;

function NotificServer(opts) {
  if (!(this instanceof NotificServer)) return new NotificServer(opts);
  events.EventEmitter.call(this);

  var opts = opts || {};

  this.id = opts.id || 0;
  this.keepalive = opts.keepalive || 60;
  this.mid = 1; // V3.1-p2.4: 0 is reserved mid
  this.channels = {};

  this.server = net.createServer(this._handler.bind(this));
  this.timer = setInterval(this.gc.bind(this), 60*1000);

  if (opts.maxconn) {
    this.server.maxConnections = opts.maxconn;
  }
}
util.inherits(NotificServer, events.EventEmitter);
exports.NotificServer = NotificServer;

exports.createServer = function (opts) {
  return new NotificServer(opts);
};

NotificServer.prototype.listen = function (port, address) {
  this.server.listen(port, address);
  return this;
};

NotificServer.prototype._handler = function (socket) {
  var self = this
    , parser = new Parser(socket)
    , client
    , channel;

  function _destroy() { socket.destroy(); }

  function _end(ack) {
    if (socket.writable) {
      socket.end(generate('connack', {returnCode: ack}));
    }
  }

  // Config socket
  socket.setTimeout(self.keepalive*1500); // V3.1-p2.2 Keep Alive timer, x1.5
  socket.setNoDelay();

  parser.on('connect', function (packet) {
    // Check re-entry, writable etc.
    if (channel) return _destroy();

    if (!socket.writable) return;

    // Check MQTT version
    if (packet.version !== MQTT_VERSION
        || packet.versionNum < MQTT_VERSION_NUM) return _end(1);

    // Check client
    if (!_validateClient(packet.client)) return _end(2);

    // MQTT keepalive
    socket.setTimeout(packet.keepalive*1500); // V3.1-p2.2 Keep Alive timer, x1.5

    // Complete handshake
    _connack(socket, 0);

    // Config channel
    client = packet.client;
    channel = self.channels[client];

    if (!channel) {
      channel = self.channels[client] = _makeChannel(socket);
    } else {
      if (channel.c) channel.c.destroy();
      channel.c = socket;
    }

    // Clean or publish retained packets
    if (packet.clean) {
      channel.q = [];
      channel.a = [];

    } else {
      // Publish retained packets
      // ackq first
      channel.a.forEach(function (packet) {
        packet.dup = 1;
        _publish(socket, packet);
      });

      // pubq
      channel.q.forEach(function (packet) {
        _publish(socket, packet);
        if (packet.qos > 0) channel.a.push(packet);
      });

      channel.q = [];
    }
  });

  parser.on('puback', function (packet) {
    if (!channel) return _destroy();

    channel.a.some(function (packet_, i, a) {
      if (packet_.messageId === packet.messageId) {
        if (i > 0) {
          var r = channel.r;
          r.push.apply(r, a.splice(0, i));
        }
        a.shift();
        return true;
      }
    });
  });

  parser.on('pingreq', function (packet) {
    if (socket.writable) {
      var packet_ = generate('pingresp');
      if (packet_) socket.write(packet_);
    }
  });

  parser.on('disconnect', function () {
    socket.end();
  });

  parser.on('reserved', _destroy);

  parser.on('notimpl', _destroy);

  parser.on('error', function (err) {
    socket.destroy();
    util.log('Parser error: -' + err.message);
  });

  socket.once('timeout', _destroy);

  socket.on('error', function (err) {
    util.log('Socket error! - ' + err.message);
  });

  socket.once('close', function () {
    if (channel && channel.c === socket) {
      channel.c = null;
    }
  });
};

// `clients` device ids
// `expiry` per minute
NotificServer.prototype.notific = function (appid, clients, payload, expiry) {
  // Validate input
  if (!appid
      || !Array.isArray(clients)
      || !payload
      || (expiry && expiry <= _now())) return;

  var self = this
    , mid = this.mid++
    , payload_ = new Buffer(JSON.stringify(payload));

  // Loop mid
  if (this.mid > 0xffff) {
    this.mid = 1; // V3.1-p2.4: 0 is reserved mid
  }

  clients.forEach(function (client) {
    self._notific(appid, client, mid, payload_, expiry);
  });
};

NotificServer.prototype._notific = function (appid, client, mid, payload_, expiry) {
  var channel = this.channels[client]
    , qos = expiry ? 1 : 0;

  if (!channel) {
    channel = this.channels[client] = _makeChannel(null);
  }

  var packet = {
    topic: appid,
    messageId: mid,
    payload: payload_,
    retain: 1,
    dup: 0,
    qos: qos,
  };

  if (qos > 0) packet.expiry = expiry;

  if (channel.c && channel.c.writable) {
    packet.retain = 0;
    _publish(channel.c, packet);
  }

  if (qos > 0) {
    (packet.retain ? channel.q
                   : channel.a).push(packet);
  }
};

// per minute
NotificServer.prototype.gc = function () {
  var self = this
    , feeds = {}
    , now = _now();

  Object.keys(self.channels).forEach(function (k) {
    var channel = self.channels[k]
      , client = k
      , e = [];

    function _expire(packet) {
      channel.e++;
      e.push(packet.topic);
    }

    // pubq
    channel.q = channel.q.filter(function (packet) {
      if (packet.expiry > now) return true;
      _expire(packet);
    });

    // ackq
    channel.a = channel.a.filter(function (packet) {
      if (packet.expiry > now) return true;
      _expire(packet);
    });

    // rejects
    channel.r = channel.r.filter(function (packet) {
      /* as expire */
      _expire(packet);
    });

    // Feedback
    e.sort().reduce(function (last, appid) {
      if (appid !== last) {
        if (!feeds[appid]) feeds[appid] = [[now, client]];
        else {
          feeds[appid].push([now, client]);
        }
      }
      return appid;
    }, '');

    // Destroy
    if (!channel.c && !channel.q.length
                   && !channel.a.length) {
      delete self.channels[k];
    }
  });

  Object.keys(feeds).forEach(function (appid) {
    self.emit('feedback', appid, feeds[appid]);
  });
};

NotificServer.prototype.close = function (cb) {
  var self = this;

  if (this.server) {
    this.server.close(cb);
    this.server = null;
  }

  if (this.timer) {
    clearInterval(this.timer);
    this.timer = null;
  }

  // Close channels
  Object.keys(this.channels).forEach(function (k) {
    var channel = self.channels[k];
    if (channel.c) channel.c.end();
  });
};

/* Internal */
function _validateClient(client) {
  return !(client.length < 1 || client.length > 23);
};

function _makeChannel(socket) {
  return {c: socket, q: [], a: [], r: [], e: 0};
}

function _connack(socket, ack) {
  var packet_ = generate('connack', {returnCode: ack});
  if (packet_) socket.write(packet_);
}

function _publish(socket, packet) {
  var packet_ = generate('publish', packet);
  if (packet_) socket.write(packet_);
}

function _now() {
  return Math.floor(Date.now() / 1000);
}
