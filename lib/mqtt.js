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
  this.mid = 0;
  this.channels = {};

  this.server = net.createServer(this._handler.bind(this));
  this.wdog = setInterval(this.gc.bind(this), 60*1000);

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
  socket.setTimeout(self.keepalive);
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
    socket.setTimeout(packet.keepalive);

    // Config channel
    client = packet.client;
    channel = self.channels[client];

    if (!channel) {
      channel = self.channels[client] = _makeChannel(socket);
    } else {
      if (channel.c) channel.c.destroy();
      channel.c = socket;
    }

    // Clean session
    if (packet.clean) {
      channel.q.length = channel.a.length = 0;

    } else {
      // Publish retained packets, etc.
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

      channel.q.length = 0;
    }
  });

  parser.on('puback', function (packet) {
    if (!channel) return _destroy();

    channel.a.some(function (packet_, i, a) {
      if (packet_.messageId === packet.messageId) {
        a.splice(i, 1);
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
    util.log('Parser error: -' + err.message);
    socket.destroy();
  });

  socket.on('timeout', _destroy);

  socket.on('error', function (err) {
    util.log('Socket error! - ' + err.message);
  });

  socket.on('close', function () {
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
    , mid = this.mid++;

  // Loop mid
  if (this.mid > 0xffff) {
    this.mid = 0;
  }

  clients.forEach(function (client) {
    self._notific(appid, client, mid, payload, expiry);
  });
};

NotificServer.prototype._notific = function (appid, client, mid, payload, expiry) {
  var channel = this.channels[client]
    , qos = expiry ? 1 : 0;

  if (!channel) {
    channel = this.channels[client] = _makeChannel(null);
  }

  var packet = {
    topic: appid,
    messageId: mid,
    payload: payload,
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
    (packet.retain ? channel.q : channel.a).push(packet);
  }
};

// per minute
NotificServer.prototype.gc = function () {
  var self = this
    , now = _now();

  Object.keys(self.channels).forEach(function (k) {
    var channel = self.channels[k]
      , q_ = []
      , a_ = [];

    // pubq
    channel.q.forEach(function (packet) {
      if (packet.expiry <= now) channel.e++;
      else {
        q_.push(packet);
      }
    });

    // ackq
    channel.a.forEach(function (packet) {
      if (packet.expiry <= now) channel.e++;
      else {
        a_.push(packet);
      }
    });

    channel.q = q_;
    channel.a = a_;

    if (!channel.c && !channel.q.length && !channel.a.length) {
      if (channel.e) {
        // TODO: feedback
      }
      delete self.channels[k];
    }
  });

  // TODO: feedbacks;
  // ...
  //this.emit('feedback', feedbacks);
};

NotificServer.prototype.close = function (cb) {
  var self = this;

  if (this.server) {
    this.server.close(cb);
    this.server = null;
  }

  if (this.wdog) {
    clearInterval(this.wdog);
    this.wdog = null;
  }

  // Close channels
  Object.keys(self.channels).forEach(function (k) {
    var channel = self.channels[k];
    if (channel.c) channel.c.end();
  });
};

/* Internal */
function _validateClient(client) {
  return !(client.length < 1 || client.length > 23);
};

function _makeChannel(socket) {
  return {c: socket, q: [], a: [], e: 0};
}

function _publish(socket, packet) {
  var packet_ = generate('publish', packet);
  if (packet_) socket.write(packet_);
}

function _now() {
  return ~~(Date.now() / 1000);
}
