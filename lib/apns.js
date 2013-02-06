var events = require('events')
  , fs = require('fs')
  , tls = require('tls')
  , util = require('util')
  , Device = require('./apns/device')
  , Notification = require('./apns/notification');

var STATE_PINIT= 0
  , STATE_LOADING = 1
  , STATE_LOADED = 2
  , STATE_CONNECTING = 3
  , STATE_READY = 4
  , STATE_PAUSE = 5
  , STATE_CLOSED = 6
  , STATE_DESTROYED = 7
  , STATE_ERROR = -1;

function NotificAgent(opts) {
  if (!(this instanceof NotificAgent)) return new NotificAgent(opts);
  events.EventEmitter.call(this);

  this.options = opts || {};
  this.channels = {};
}
util.inherits(NotificAgent, events.EventEmitter);
exports.NotificAgent = NotificAgent;

exports.createAgent = function (opts) {
  return new NotificAgent(opts);
};

// `tokens` APNS tokens
// `payload` Apple defined spec
NotificAgent.prototype.notific = function (appid, tokens, payload, expiry) {
  // Validate input
  if (!appid
      || !Array.isArray(tokens)
      || !payload
      || (expiry && expiry <= _now())) return;

  var self = this
    , channel = this.channels[appid];

  if (!channel) {
    channel = this.channels[appid]
            = new Channel(this, appid, this.options[appid]);
  }

  // Batch send
  tokens.forEach(function (token) {
    var n = new Notification();
    n.device = new Device(token);
    n.payload = payload;
    n.expiry = expiry;
    channel.send(n);
  });
};

NotificAgent.prototype.close = function () {
  var self = this;

  Object.keys(this.channels).forEach(function (k) {
    self.channels[k].close();
    delete self.channels[k];
  });
};

function Channel(agent, appid, opts) {
  if (!(this instanceof Channel)) return new Channel(agent, appid, opts);
  events.EventEmitter.call(this);

  var opts = opts || {};

  this.agent = agent;
  this.appid = appid;
  this.keepalive = opts.keepalive || 300;
  this.maxcache = opts.maxcache || 100;

  this.tlsOptions = {
    host: opts.gateway || 'gateway.push.apple.com',
    port: opts.port || 2195,
    key: opts.key,
    cert: opts.cert,
    passphrase: opts.passphrase,
  };

  this.state = STATE_PINIT;
  this.nid = 0;
  this.c = null;
  this.q = [];
  this.a = [];

  if (opts.key && opts.cert) {
    this.state = STATE_LOADED;
  } else {
    this._loadCert(opts.keyfile, opts.certfile);
  }
}
util.inherits(Channel, events.EventEmitter);
exports.Channel = Channel;

Channel.prototype._loadCert = function (keyfile, certfile) {
  var self = this
    , opts = this.tlsOptions;

  this.state = STATE_LOADING;

  if (!opts.key) {
    fs.readFile(keyfile, function (err, data) {
      if (err) return;
      opts.key = data;
      loaded();
    });
  }

  if (!opts.cert) {
    fs.readFile(certfile, function (err, data) {
      if (err) return;
      opts.cert = data;
      loaded();
    });
  }

  function loaded() {
    if (!opts.key || !opts.cert) return;

    if (self.state == STATE_LOADING) {
      self.state = STATE_LOADED;
      self._flush();
    }
  }
};

Channel.prototype.send = function (note) {
  // Identifier
  note.id = this.nid++;

  // Loop nid
  if (this.nid > 0xffffffff) {
    this.nid = 0;
  }

  if (note.pack()) {
    this.q.push(note);
    this._flush();
  }
};

Channel.prototype._flush = function () {
  // Check empty queue
  if (!this.q.length) return;

  switch (this.state) {
    case STATE_PINIT:
    case STATE_LOADING:
    case STATE_CONNECTING:
    case STATE_PAUSE:
    case STATE_DESTROYED:
    case STATE_ERROR:
      break;

    case STATE_LOADED:
    case STATE_CLOSED:
      this._connect();
      break;

    case STATE_READY:
      this._writeOut();
      break;
  }
};

Channel.prototype._connect = function () {
  if (this.state != STATE_LOADED
      && this.state != STATE_CLOSED
      && this.state != STATE_READY) return;

  var self = this;

  var socket = tls.connect(this.tlsOptions, function () {
    // Config socket, must set after connected
    socket.setNoDelay(false);

    if (self.c !== socket) return;

    if (self.state == STATE_CONNECTING) {
      self.state = STATE_READY;
      schedFlush();
    }
  });

  this.state = STATE_CONNECTING;
  this.c = socket;

  // Keepalive
  socket.setTimeout(this.keepalive*1000);

  // APNS error
  socket.on('data', function (data) {
    // Shutdown first
    socket.end();

    if (data[0] != 8) return;

    var code = data[1]
      , id = data.readUInt32BE(2)
      , device;

    self.a.some(function (note, i, a) {
      if (note.id === id) {
        device = note.device;
        a.splice(0, i+1);
        return true;
      }
    });

    self.q = self.a.concat(self.q);
    self.a = [];

    util.log('APNS error! - ' + code + ', device: ' + device);
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

    if (self.state == STATE_CONNECTING
        || self.state == STATE_READY
        || self.state == STATE_PAUSE) {
      self.state = STATE_CLOSED;
      self.c = null;
      schedFlush();
    }
  });

  function schedFlush() {
    process.nextTick(function () {
      self._flush();
    });
  }
};

Channel.prototype._writeOut = function () {
  // Check valid states
  if (this.state != STATE_READY) return;

  var ok, note
    , c = this.c
    , q = this.q
    , a = this.a;

  if (!c || !c.writable) {
    this._connect();
    return;
  }

  for (ok = true; ok && q.length;) {
    note = q.shift();
    ok = c.write(note.buffer);
    a.push(note);

    if (a.length > this.maxcache) {
      a.shift();
    }
  }

  // Need recheck states
  if (this.state == STATE_READY && !ok) {
    this.state = STATE_PAUSE;
  }
};

Channel.prototype.close = function () {
  // Destroy state, blackhole
  this.state = STATE_DESTROYED;

  if (this.c) {
    this.c.end();
    this.c = null;
  }
};

/* Internal */
function _now() {
  return ~~(Date.now() / 1000);
}
