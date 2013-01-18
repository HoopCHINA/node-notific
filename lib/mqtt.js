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
  this.gc_timer = setInterval(60*1000, this.gc.bind(this));

  if (opts.maxconn !== undefined) {
    this.server.maxConnections = opts.maxconn;
  }
}
util.inherits(NotificServer, events.EventEmitter);
exports.NotificServer = NotificServer;

NotificServer.prototype.listen = function (port, address) {
  this.server.listen(port, address);
  return this;
};

NotificServer.prototype._handler = function (socket) {
  var self = this
    , parser = new Parser(socket)
    , token
    , channel;

  function _destroy() { socket.destroy(); }

  function _endWithAck(ack) {
    if (socket.writable) {
      socket.end(generate('connack', {returnCode: ack}));
    }
  }

  // Config socket
  socket.setNoDelay();
  socket.setTimeout(self.keepalive);

  parser.on('connect', function (packet) {
    // Check re-entry, writable etc.
    if (channel) return _destroy();

    if (!socket.writable) return;

    // Check MQTT version
    if (packet.version !== MQTT_VERSION
        || packet.versionNum < MQTT_VERSION_NUM) return _endWithAck(1);

    // Check token
    if (!_validToken(packet.client)) return _endWithAck(2);

    // Socket timeout
    if (socket.readable) {
      socket.setTimeout(packet.keepalive);
    }

    // Config channel
    token = packet.client;
    channel = self.channels[token];

    if (!channel) {
      channel = self.channels[token] = _makeChannel(socket);
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
    if (!channel) return _destroy();

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

// `token` device token
// `expiry` per minute
NotificServer.prototype.notific = function (app, tokens, payload, expiry) {
  // Check expiry
  if (expiry !== undefined && expiry <= _now()) return;

  var self = this
    , mid = this.mid++;

  if (mid > 0xffff) mid = 0;

  tokens.forEach(function (token) {
    self._notific(app, token, mid, payload, expiry);
  });
};

NotificServer.prototype._notific = function (app, token, mid, payload, expiry) {
  var channel = this.channels[token]
    , qos = expiry !== undefined ? 1 : 0;

  if (!channel) {
    channel = this.channels[token] = _makeChannel(null);
  }

  var packet = {
    topic: app,
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

  this.server.close(cb);

  clearInterval(this.gc_timer);

  // Close channels
  Object.keys(self.channels).forEach(function (k) {
    var channel = self.channels[k];
    if (channel.c) channel.c.end();
  });
};

/* Privates */
function _validToken(token) {
  // TODO: check by token rules
  return !(token.length < 1 || token.length > 23);
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
