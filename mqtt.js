var mqtt = require('mqttjs');

// TODO: fix MQTT.js connect() of parse.js, the null return of parse_string() bug...

var MQTT_VERSION = 'MQIsdp'
  , MQTT_VERSION_NUM = 3;

function MQTTNotificServer(opts) {
  this.opts = {
    defaultKeepalive : 60,
    maxConnections: 3000,
  };

  this.opts = util.merge(this.opts, opts);
  
  this.mqttServer = mqtt.createServer(this._handler.bind(this));

  this.channels = {};

  this.server.maxConnections = this.opts.maxConnections;
}

MQTTNotificServer.prototype.listen = function (port, address) {
  this.server.listen(port, address);
};

MQTTNotificServer.prototype._handler = function (client) {
  function _destroy() { client.stream.destroy(); }

  function _destroySoon() { client.stream.destroySoon(); }

  function _isValidId() {
    // id.length < 1 || id.length > 23 return false;
  }

  client.stream.setNoDelay();
  client.stream.setTimeout(server.opts.defaultKeepalive, _destroySoon);

  client.on('connect', function (packet) {
    // Check version and client id
    if (packet.version != MQTT_VERSION || packet.versionNum < MQTT_VERSION_NUM) {
      this.connack({ returnCode: 1 }); _destroySoon(); return;
    } else if (!_isValidId(packet.client)) {
      this.connack({ returnCode: 2 }); _destroySoon(); return;
    }

    this.id = packet.client;
    this.clean = packet.clean;
    this.keepalive = packet.keepalive;
    this.stream.setTimeout(this.keepalive);

    // Config channel
    var channel = server.channels[this.id];

    if (!channel)
      channel = server.channels[this.id] = {c: this, q: [], a: []};
    else if (channel.c) {
      channel.c.stream.destroy();
      channel.c = this;
    }

    if (this.clean) {
      // Clean session
      channel.q.length = channel.a.length = 0;
    } else {
      // Publish retained packets
      var self = this;

      channel.q.forEach(function (packet) {
        self.publish(packet);
      });
      channel.a.forEach(function (packet) {
        packet.dup = 1;
        self.publish(packet);
      });
      // Concat pubq to ackq
      channel.a = channel.a.concat(channel.q);
      channel.q.length = 0;
    }
  });

  client.on('puback', function (packet) {
    if (!this.id) { _destroy(); return; }

    var channel = server.channels[this.id];
    if (!channel) return;

    var a = channel.a;

    for (var i = 0, j = a.length; i < j; i++) {
      if (a[i].messageId === packet.messageId) {
        a.splice(index, 1);
        break;
      }
    }
  });

  client.on('pingreq', function(packet) {
    this.pingresp();
  });

  client.on('disconnect', _destroySoon);

  client.on('error', function (err) {
    util.log('error! - ' + err);
  });

  client.on('close', function () {
    if (!this.id) return;

    var channel = server.channels[this.id];

    if (channel && channel.c === this) {
      channel.c = null;
    }
  });

  var evs = ['connack', 'publish', 'pubrec', 'pubrel', 'pubcomp',
             'subscribe', 'suback', 'unsubscribe', 'unsuback',
             'pingresp', 'reserved'];

  evs.forEach(function (ev) {
    client.on(ev, _destroy);
  });
};

// expiry 以分钟为精度
MQTTNotificServer.prototype.notific = function (tokens, payload, expiry) {
  if (typeof expiry !== 'undefined'
      && expiry < Date.now() / 1000) return;

  var self = this;

  tokens.forEach(function (token) {
    self._notific(token, payload, expiry);
  });
};

MQTTNotificServer.prototype._notific = function (token, payload, expiry) {
  var server = this.server;

  var id = this._getClientIdByToken(token);
  var channel = server.channels[id];

  if (!channel) {
    channel = server.channels[id] = {c: null, q: [], a: []};
  }

  var retain = (typeof expiry !== 'undefined');

  var packet = {
    retain: retain,
    dup: 0,
    expiry: expiry,
    payload: payload,
    topic: token,
  };

  if (channel.c) channel.c.publish(packet);

  if (retain) {
    (!channel.c ? channel.q : channel.a).push(packet);
  }
};

// per minute
MQTTNotificServer.prototype._gc = function () {
  var server = this.server
    , now = Date.now() / 1000;

  for (var i in server.channels) {
    if (server.channels.hasOwnProperty(i)) {
      var channel = server.channels[i]
        , q_ = []
        , a_ = [];

      channel.q.forEach(function (packet) {
        if (packet.expiry >= now) {
          q_.push(packet);
        }
      });
      channel.a.forEach(function (packet) {
        if (packet.expiry >= now) {
          a_.push(packet);
        }
      });

      channel.q = q_;
      channel.a = a_;

      if (!channel.c && !channel.q.length && !channel.a.length) {
        delete channels[i];
      }
    }
  }

  // feedback task;
  // ...
  this.emit('feedback', feedbacks);
};