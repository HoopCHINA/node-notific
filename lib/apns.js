/* Copyright (c) 2013 Wang Wenlin. See LICENSE for more information */

var events = require('events')
  , fs = require('fs')
  , tls = require('tls')
  , util = require('util')
  , Device = require('./apns/device')
  , Notification = require('./apns/notification')
  , Errors = require('./apns/errors');

var STATE_INIT = 0
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

  this.options = opts || {};
  this.pushChannels = {};
  this.fbckChannels = {};
}
util.inherits(NotificAgent, events.EventEmitter);
exports.NotificAgent = NotificAgent;

exports.createAgent = function (opts) {
  return new NotificAgent(opts);
};

// @payload Apple defined spec
// @tokens APNS tokens
NotificAgent.prototype.notific = function (appid, tokens, payload, expiry) {
  // Validate input
  if (!appid
      || !Array.isArray(tokens)
      || !payload
      || (expiry && expiry <= _now())) return;

  var self = this
    , channel = this.pushChannels[appid]
    , payload_ = new Buffer(JSON.stringify(payload));

  if (!channel) {
    channel = this.pushChannels[appid]
            = new PushChannel(this, appid, this.options[appid]);

    channel.on('invtoken', function (tok) {
      self.emit('invtoken', appid, tok);
    });
  }

  // Batch send
  tokens.forEach(function (tok) {
    var n = new Notification();

    // Fix invalid hex of tok
    try {
      n.device = new Device(tok);
    } catch (e) {
      process.nextTick(function () {
        self.emit('invtoken', appid, tok);
      });
      return;
    }
    n.payload = payload_;
    n.expiry = expiry;

    channel.send(n);
  });
};

NotificAgent.prototype.feedback = function (appid, cb) {
  // Validate input
  if (!appid) return;

  var self = this
    , channel = this.fbckChannels[appid];

  if (!channel) {
    channel = this.fbckChannels[appid]
            = new FeedbackChannel(this, appid, this.options[appid]);

    channel.on('feedback', function (feeds) {
      self.emit('feedback', appid, feeds);
    });
  }

  channel.feedback(cb);
};

NotificAgent.prototype.close = function () {
  var self = this;

  Object.keys(this.pushChannels).forEach(function (k) {
    self.pushChannels[k].close();
  });
};

/* Push Service */
function PushChannel(agent, appid, opts) {
  if (!(this instanceof PushChannel)) return new PushChannel(agent, appid, opts);
  events.EventEmitter.call(this);

  var opts = opts || {}
    , popts = opts.push || {};

  this.agent = agent;
  this.appid = appid;
  this.keepalive = popts.keepalive || 150;
  this.maxcache = popts.maxcache || 750;

  this.state = STATE_INIT;
  this.nid = 1; // Align with MQTT, 0 is reserved
  this.c = null;
  this.q = [];
  this.a = []; // ACK cache

  this.tlsOptions = {
    host: popts.host || 'gateway.push.apple.com',
    port: popts.port || 2195,
    keyFile: opts.keyfile,
    key: opts.key,
    certFile: opts.certfile,
    cert: opts.cert,
    passphrase: opts.passphrase,
  };
}
util.inherits(PushChannel, events.EventEmitter);
exports.PushChannel = PushChannel;

PushChannel.prototype.send = function (note) {
  // Identifier
  note.id = this.nid++;

  if (this.nid > 0xffffffff) {
    this.nid = 1; // Align with MQTT, 0 is reserved
  }

  // Enqueue
  this.q.push(note);
  // Flush out
  this._flush();
};

PushChannel.prototype._flush = function () {
  // Check empty queue
  if (!this.q.length) return;

  if (this.state == STATE_READY) {
    this._writeOut();

  } else if (this.state == STATE_LOADED) {
    this._connect();

  } else if (this.state == STATE_INIT) {
    var self = this
      , opts = this.tlsOptions;

    this.state = STATE_LOADING;

    _loadCert(opts, function () {
      if (self.state == STATE_LOADING) {
        self.state = STATE_LOADED;
        self._flush();
      }
    });
  }
};

PushChannel.prototype._connect = function () {
  // Check valid states
  if (this.state != STATE_LOADED) return;

  var self = this
    , socket;

  this.state = STATE_CONNECTING;

  this.c = socket
         = tls.connect(this.tlsOptions, function () {
    // Config socket, must set after connected
    socket.setNoDelay(false);

    if (self.c !== socket) return;

    if (self.state == STATE_CONNECTING) {
      self.state = STATE_READY;
      schedFlush();
    }
  });

  // Keepalive
  socket.setTimeout(this.keepalive*1000);

  socket.on('drain', function () {
    if (self.c !== socket) return;

    if (self.state == STATE_PAUSE) {
      self.state = STATE_READY;
      schedFlush();
    }
  });

  socket.once('data', function (data) {
    // APNS response, means has error
    // Shutdown the socket first
    socket.end();

    // Check valid
    if (self.c !== socket) return;

    // Check response
    if (data[0] != 8) return;

    var code = data[1]
      , id = data.readUInt32BE(2)
      , device;

    // Error Log
    util.log('APNS error! - ' + code);

    // Rollback
    self.a.some(function (note, i, a) {
      if (note.id === id) {
        device = note.device;
        a.splice(0, i+1);
        return true;
      }
    });

    self.q = self.a.concat(self.q);
    self.a = [];

    if (code == Errors['invalidToken']) {
      self.emit('invtoken',
                (device || '').toString());
    }
  });

  socket.once('timeout', function () {
    socket.destroy();
    util.log('Socket timeout!');
  });

  socket.on('error', function (err) {
    socket.destroy(); // Workaround of Node's pipe bug
    util.log('Socket error! - ' + err.message);
  });

  socket.once('close', function () {
    if (self.c !== socket) return;

    if (self.state == STATE_CONNECTING
        || self.state == STATE_READY
        || self.state == STATE_PAUSE) {
      self.state = STATE_CLOSED;
      self.c = null;
      schedConnect();
    }
  });

  function schedFlush() {
    process.nextTick(function () {
      self._flush();
    });
  }

  function schedConnect() {
    setTimeout(function () {
      if (self.c) return;

      if (self.state == STATE_CLOSED) {
        self.state = STATE_LOADED;
        self._flush();
      }
    }, 0);
  }
};

PushChannel.prototype._writeOut = function () {
  // Check valid states
  if (this.state != STATE_READY
      || !this.c
      || !this.c.writable) return;

  var self = this
    , ok = true
    , now = _now()
    , c = this.c
    , q = this.q
    , a = this.a;

  for (var i = 0; ok && i < 64 && q.length; ++i) {
    if (!c.writable) return;

    var note = q.shift()
      , exp = note.expiry
      , buf;

    if (exp && exp <= now) continue;

    if (!(buf = note.pack())) continue;

    ok = c.write(buf);
    a.push(note);

    if (a.length > this.maxcache) {
      a.shift();
    }
  }

  // Need recheck states
  if (self.c !== c) return;

  if (self.state == STATE_READY) {
    self.state = STATE_PAUSE;
    if (ok) schedCycle();
  }

  // Give a chance to read eof
  function schedCycle() {
    setTimeout(function () {
      if (self.c !== c) return;

      if (self.state == STATE_PAUSE) {
        self.state = STATE_READY;
        self._flush();
      }
    }, 0);
  }
};

PushChannel.prototype.close = function () {
  // Cleanup
  this.q = [];
  this.a = [];

  if (this.c) {
    this.c.end();
    this.c = null;
  }
};

/* Feedback Service */
function FeedbackChannel(agent, appid, opts) {
  if (!(this instanceof FeedbackChannel)) return new FeedbackChannel(agent, appid, opts);
  events.EventEmitter.call(this);

  var opts = opts || {}
    , fopts = opts.feedback || {};

  this.agent = agent;
  this.appid = appid;
  this.keepalive = fopts.keepalive || 60;

  this.state = STATE_INIT;

  this.tlsOptions = {
    host: fopts.host || 'feedback.push.apple.com',
    port: fopts.port || 2196,
    keyFile: opts.keyfile,
    key: opts.key,
    certFile: opts.certfile,
    cert: opts.cert,
    passphrase: opts.passphrase,
  };
}
util.inherits(FeedbackChannel, events.EventEmitter);
exports.FeedbackChannel = FeedbackChannel;

FeedbackChannel.prototype.feedback = function (cb) {
  // Bypass later calls
  if (this.state != STATE_INIT) return;

  var self = this
    , opts = this.tlsOptions;

  this.state = STATE_LOADING;

  _loadCert(opts, function () {
    if (self.state == STATE_LOADING) {
      self.state = STATE_LOADED;
      /* Lazy-eval pattern */
      self.feedback = self._feedback;
      self.feedback(cb);
    }
  });
};

FeedbackChannel.prototype._feedback = function (cb) {
  var self = this
    , socket = tls.connect(this.tlsOptions)
    , buff;

  // Keepalive
  socket.setTimeout(this.keepalive*1000);

  // Feedback data
  socket.on('data', function (data) {
    var feeds = [];

    /* Concat buffer */
    if (buff && buff.length) {
      buff = Buffer.concat([buff, data]);
    } else {
      buff = data;
    }

    for (; buff.length > 6; buff = buff.slice(pos)) {
      var tim = buff.readUInt32BE(0)
        , pos = 6 + buff.readUInt16BE(4);

      // Too short
      if (buff.length < pos) break;
      // Collect
      feeds.push([tim, buff.toString('hex', 6, pos)]);
    }

    if (feeds.length) {
      if (typeof cb === 'function') cb(feeds);
      self.emit('feedback', feeds);
    }
  });

  socket.once('timeout', function () {
    socket.destroy();
    util.log('Socket timeout!');
  });

  socket.on('error', function (err) {
    socket.destroy(); // Workaround of Node's pipe bug
    util.log('Socket error! - ' + err.message);
  });
};

/* Internal */
function _now() {
  return Math.floor(Date.now() / 1000);
}

// @opts tlsOptions
function _loadCert(opts, cb) {
  if (!opts) return;

  if (opts.key && opts.cert) {
    loaded();
    return;
  }

  if (!opts.key) {
    fs.readFile(opts.keyFile, function (err, data) {
      if (err) return;
      opts.key = data;
      loaded();
    });
  }

  if (!opts.cert) {
    fs.readFile(opts.certFile, function (err, data) {
      if (err) return;
      opts.cert = data;
      loaded();
    });
  }

  function loaded() {
    if (!opts.key || !opts.cert) return;
    if (typeof cb === 'function') cb();
  }
}
