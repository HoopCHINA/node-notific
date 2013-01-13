var events = require('events')
  , util = require('util')
  , mqtt = require('mqttjs');

// Monkey patches for mqtt.js
(function () {
  var Connection = require('mqttjs/lib/connection');

  var methods = [
    'destroy',
    'destroySoon',
    'end',
    'setNoDelay',
    'setTimeout',
  ];

  methods.forEach(function (method) {
    Connection.prototype[method] = function () {
      return this.stream[method].apply(this.stream, arguments);
    };
  });
})();

// TODO: fix MQTT.js connect() in parse.js, the null return of parse_string() bug...
// FIX: all security holes in parse.js

var MQTT_VERSION = 'MQIsdp'
  , MQTT_VERSION_NUM = 3;

function MQTTNotificServer(/* [options] */) {
  if (!(this instanceof MQTTNotificServer)) return new MQTTNotificServer(arguments[0]);
  events.EventEmitter.call(this);

  var opts = arguments[0] || {};

  this.id = opts.inst || 0;
  this.keepalive = opts.keepalive || 60;
  this.channels = {};
  this.xid = 0;

  //this.server = mqtt.createServer(this._handler.bind(this));
  this.server = net.createServer(this._handler.bind(this));

  if (opts.maxConnections !== undefined)
    this.server.maxConnections = opts.maxConnections;

  this.gc_timer = setInterval(60*1000, this.gc.bind(this));
}
util.inherits(MQTTNotificServer, events.EventEmitter);
exports.MQTTNotificServer = MQTTNotificServer;

MQTTNotificServer.prototype.close = function (cb) {
  this.server.close(cb);
  // TODO: close all connections
  // TODO: dispose other resources
  // TODO: clearInterval(this.gc_timer);
}

MQTTNotificServer.prototype.listen = function (port, address) {
  this.server.listen(port, address);
  return this;
};

MQTTNotificServer.prototype._handler = function (socket) {
  var self = this;

  var parser = new Parser(socket);

  function _destroy() { socket.destroy(); }

  function _destroySoon() { socket.destroySoon(); }

  function _destroyWithAck(ack) {
    socket.write(pack.connack({returnCode: ack}));
    socket.destroySoon();
  }

  function _isValidToken(token) {
    // token.length < 1 || token.length > 23 return false;
    // hash(token)[0:2] === self.id;
    return true;
  }

  client.setNoDelay();
  client.setTimeout(this.keepalive, _destroy);

  parser.on('connect', function (packet) {
    // Check MQTT version
    if (packet.version !== MQTT_VERSION || packet.versionNum < MQTT_VERSION_NUM)
      return _destroyWithAck(1);

    // Check token
    if (!_isValidToken(packet.client)) return _destroyWithAck(2);

    client.token = packet.client;
    client.setTimeout(packet.keepalive);

    // Config channel
    var channel = self.channels[client.token];

    if (!channel)
      channel = self.channels[client.token] = _makeChannel(client);
    else if (channel.c) {
      channel.c.destroy();
      channel.c = client;
    }

    if (packet.clean) {
      // Clean session
      channel.q.length = channel.a.length = 0;

    } else {
      // Publish retained packets
      // ackq first
      channel.a.forEach(function (packet) {
        packet.dup = 1;
        client.publish(packet);
      });

      // pubq
      channel.q.forEach(function (packet) {
        client.write(publish(packet));
        if (packet.qos > 0) channel.a.push(packet);
      });

      channel.q.length = 0;
    }
  });

  parser.on('puback', function (packet) {
    if (!client.token) return _destroy();

    var channel = self.channels[client.token];
    if (!channel) return;

    var a = channel.a;

    for (var i = 0, j = a.length; i < j; i++) {
      if (a[i].messageId === packet.messageId) {
        a.splice(index, 1);
        break;
      }
    }
  });

  parser.on('pingreq', function (packet) {
    var packet_ = pack.pingresp();
    if (packet_) client.write(packet_);
  });

  parser.on('disconnect', function () {
    client.end();
  });

  parser.on('reserved', _destroy);

  parser.on('error', _destroy);

  client.on('error', function (err) {
    util.log('error! - ' + err);
  });

  client.on('close', function () {
    if (!client.id) return;

    var channel = self.channels[client.id];

    if (channel && channel.c === client) {
      channel.c = null;
    }
  });

  var evs = ['connack', 'publish', 'pubrec', 'pubrel', 'pubcomp',
             'subscribe', 'suback', 'unsubscribe', 'unsuback',
             'pingresp', 'reserved'];

  evs.forEach(function (ev) {
    parser.on(ev, _destroy);
  });
};

// `token` device token
// `expiry` per minute
MQTTNotificServer.prototype.notific = function (app, tokens, payload, expiry) {
  // Check expiry
  if (expiry !== undefined && expiry <= _now()) return;

  var self = this
    , xid = this.xid++;

  if (xid > 0xffff) xid = 0;

  tokens.forEach(function (token) {
    self._notific(app, token, xid, payload, expiry);
  });
};

MQTTNotificServer.prototype._notific = function (app, token, xid, payload, expiry) {
  var channel = this.channels[token]
    , qos = expiry !== undefined ? 1 : 0;

  if (!channel) {
    channel = this.channels[token] = _makeChannel(null);
  }

  var packet = {
    topic: app,
    messageId: xid,
    payload: payload,
    retain: 1,
    dup: 0,
    qos: qos,
  };

  if (qos > 0) packet.expiry = expiry;

  if (channel.s && channel.s.writable) {
    packet.retain = 0;
    channel.s.write(pack.publish(packet));
  }

  if (qos > 0) {
    (packet.retain ? channel.q : channel.a).push(packet);
  }
};

// per minute
MQTTNotificServer.prototype.gc = function () {
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
      delete channels[k];
    }
  });

  // TODO: feedbacks;
  // ...
  //this.emit('feedback', feedbacks);
};

// hash token to instance_id
exports.hashToken = function (token) {
  // TODO: hash
  return token;
};

function _makeChannel(socket) {
  return {s: socket, q: [], a: [], e: 0};
}

function _now() {
  return ~~(Date.now() / 1000);
}