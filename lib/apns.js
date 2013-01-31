var apns = require('apn');

var connections = {};

/**
  notific(appid, clients, payload, expiry);
 */
exports.notific = function (appid, clients, payload, expiry) {
  var c = connections[appid];

  if (!c) {
    var options = {
      cert: config[appid].cert,
      certData: null,
      key:  config[appid].key,
      keyData: null,
      passphrase: null,
      ca: null,
      gateway: 'gateway.push.apple.com',
      port: 2195,
      enhanced: true,
      errorCallback: function (err, data) {
        console.error('NotificIOS Send Error:', err.message, JSON.stringify(data));
      },
      cacheLength: 8000,
      connectionTimeout: 300*1000,
    };

  	c = connections[appid] = new apns.Connection(options);
  }

  tokens.forEach(function (token) {
    var note = new apns.Notification();

    note.device = new apns.Device(token);
    note.expiry = expiry;

    if (payload.badge !== undefined) note.badge = payload.badge;
    if (payload.sound !== undefined && payload.sound !== '') note.sound = payload.sound;

    note.alert = payload.alert;
    note.payload = { 'url': payload.url };

    c.sendNotification(note);
  });
};


var events = require('events')
  , net = require('net')
  , util = require('util');

var STATE_IDLE = 0
  , STATE_LOADING = 1
  , STATE_LOADED = 2
  , STATE_CONNECTING = 3
  , STATE_READY = 4
  , STATE_PAUSE = 5
  , STATE_CLOSED = 6
  , STATE_ERROR = -1;

function NotificAgent(opts) {
  if (!(this instanceof NotificAgent)) return new NotificAgent(opts);
  events.EventEmitter.call(this);

  this.channels = {};

}
util.inherits(NotificAgent, events.EventEmitter);
exports.NotificAgent = NotificAgent;

exports.createAgent = function (opts) {
  return new NotificAgent(opts);
};

// `clients` device ids
NotificAgent.prototype.notific = function (appid, clients, payload, expiry) {
  // Validate input
  if (!appid
      || !Array.isArray(clients)
      || !payload
      || (expiry && expiry <= _now())) return;

  var self = this
    , channel = this.channels[appid]
    , note;

  if (!channel) {
    channel = this.channels[appid]
            = new Channel(opts);

    channel.on('error', function (err) {
      self.emit('error', err);
    });
  }

  note = new Notification();
  note.badge = badge;
    note.device = new apns.Device(token);
    note.expiry = expiry;

    if (payload.badge !== undefined) note.badge = payload.badge;
    if (payload.sound !== undefined && payload.sound !== '') note.sound = payload.sound;

    note.alert = payload.alert;
    note.payload = { 'url': payload.url };

  clients.forEach(function (client) {
    var note_ = note.clone();
    channel.send(appid, client, payload, expiry);
  });
};

function Channel(opts) {
  if (!(this instanceof Channel)) return new Channel(opts);
  events.EventEmitter.call(this);

  this.state = STATE_IDLE;
  this.keepalive = 300*1000;

  this.nid = 0;

  this.c = null;
  this.q = [];
  this.a = [];

  if (this.key && this.cert) {
    this.state = STATE_LOADED;
  } else {
    this._loadCert();
  }
}
util.inherits(Channel, events.EventEmitter);
exports.Channel = Channel;

Channel.prototype._loadCert = function () {
  var self = this;

  this.state = STATE_LOADING;

  if (!this.cert) {
    fs.readFile(CERTFILE, function (err, data) {
      if (err) return;
      self.cert = data.toString();
      loaded();
    });
  }

  if (!this.key) {
    fs.readFile(KEYFILE, function (err, data) {
      if (err) return;
      self.key = data.toString();
      loaded();
    });
  }

  function loaded() {
    if (!self.cert || !self.key) return;

    if (self.state == STATE_LOADING) {
      self.state = STATE_LOADED;
      self._flush();
    }
  }
};

Channel.prototype.send = function (note) {
  note.id = this.nid++;

  // Loop nid
  if (this.nid > 0xffffffff) {
    this.nid = 0;
  }

  if (!note.pack()) return;

  this.q.push(note);
  this._flush();
};

Channel.prototype._flush = function () {
  var ok, note
    , c = this.c
    , q = this.q
    , a = this.a;

  if (!q.length) return;

  switch (this.state) {
    case STATE_IDLE:
    case STATE_LOADING:
    case STATE_CONNECTING:
    case STATE_PAUSE:
    case STATE_ERROR:
      break;

    case STATE_LOADED:
    case STATE_CLOSED:
      this._connect();
      break;

    case STATE_READY:
      if (!c || !c.writable) {
        this._connect();
        break;
      }

      for (ok = true; ok && q.length;) {
        note = q.shift();
        ok = c.write(note.buffer);
        a.push(note);
      }

      this.state = q.length ? STATE_PAUSE
                            : STATE_READY;
      break;
  }
};

Channel.prototype._connect = function () {
  if (this.state == STATE_CONNECTING
      || (this.c && this.c.writable)) return;

  var self = this;

  var socket = tls.connect(PORT, GATEWAY, opt, function () {
    // Config socket
    socket.setNoDelay();

    if (self.c !== socket) return;

    if (self.state == STATE_CONNECTING) {
      self.state = STATE_READY;
      schedFlush();
    }
  });

  this.state = STATE_CONNECTING;
  this.c = socket;

  // Keepalive
  socket.setTimeout(this.keepalive);

  // APNS error
  socket.on('data', function (data) {
    // Shutdown first
    socket.end();

    if (data[0] != 8) return;

    var code = data[1]
      , id = data.readUInt32BE(2)
      , err = new Error('APNS error: ' + code);

    self.a.some(function (note, i, a) {
      if (note.id === id) {
        a.splice(0, i+1);
        err.note = note;
        return true;
      }
    });

    self.q = self.a.concat(self.q);
    self.a = [];

    self.emit('error', err);
  });

  socket.on('drain', function () {
    if (self.c !== socket) return;

    if (self.state == STATE_PAUSE) {
      self.state = STATE_READY;
      schedFlush();
    }
  });

  socket.on('timeout', function () {
    socket.destroy();
  });

  socket.on('error', function (err) {
    util.log('Socket error! - ' + err.message);
  });

  socket.on('close', function () {
    if (self.c !== socket) return;

    self.state = STATE_CLOSED;
    self.c = null;
    schedFlush();
  });

  function schedFlush() {
    process.nextTick(function () {
      self._flush();
    });
  }
};

/* Internal */
function _now() {
  return ~~(Date.now() / 1000);
}
