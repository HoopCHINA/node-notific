/* Copyright (c) 2013 Wang Wenlin. See LICENSE for more information */

var events = require('events')
  , fs = require('fs')
  , tls = require('tls')
  , util = require('util')
  , Device = require('./apns/device')
  , Notification = require('./apns/notification')
  , Errors = require('./apns/errors');

/* Node.js v0.8.x compatible */
var setImmediate = global.setImmediate || process.nextTick;

/* APNS agent states */
var STATE_INIT = 0
  , STATE_LOADING = 1
  , STATE_LOADED = 2
  , STATE_CONNECTING = 3
  , STATE_READY = 4
  , STATE_PAUSE = 5
  , STATE_CLOSED = 6
  , STATE_ERROR = -1;

/**
 * @class NotificAgent
 */
function NotificAgent(opts) {
  if (!(this instanceof NotificAgent)) return new NotificAgent(opts);
  events.EventEmitter.call(this);

  this.options = opts || {};
  this.pushChannels = {};
}
util.inherits(NotificAgent, events.EventEmitter);
exports.NotificAgent = NotificAgent;

exports.createAgent = function (opts) {
  return new NotificAgent(opts);
};

/**
 * @proto void notific(appid, tokens, payload, expiry)
 */
NotificAgent.prototype.notific = function (appid, tokens, payload, expiry) {
  // Check appid exists
  if (!this.options[appid]) throw Error('`appid` is invalid');

  var self = this
    , channel = this.pushChannels[appid];

  if (!channel) {
    channel = this.pushChannels[appid]
            = new PushChannel(this.options[appid]);

    channel.on('invtoken', function (tok) {
      self.emit('invtoken', appid, tok);
    });
  }

  channel.notific(tokens, payload, expiry);
};

NotificAgent.prototype.close = function () {
  var self = this;

  Object.keys(this.pushChannels).forEach(function (k) {
    self.pushChannels[k].close();
    delete self.pushChannels[k];
  });
};

/**
 * @class FeedbackAgent
 */
function FeedbackAgent(opts) {
  if (!(this instanceof FeedbackAgent)) return new FeedbackAgent(opts);
  events.EventEmitter.call(this);

  this.options = opts || {};
  this.fbChannels = {};
}
util.inherits(FeedbackAgent, events.EventEmitter);
exports.FeedbackAgent = FeedbackAgent;

exports.createFeedback = function (opts) {
  return new FeedbackAgent(opts);
};

FeedbackAgent.prototype.feedback = function (appid, cb) {
  // Check appid exists
  if (!this.options[appid]) throw Error('`appid` is invalid');

  var self = this
    , channel = this.fbChannels[appid];

  if (!channel) {
    channel = this.fbChannels[appid]
            = new FeedbackChannel(this.options[appid]);

    channel.on('feedback', function (feeds) {
      self.emit('feedback', appid, feeds);
    });
  }

  channel.feedback(cb);
};

FeedbackAgent.prototype.close = function () {
  var self = this;

  Object.keys(this.fbChannels).forEach(function (k) {
    self.fbChannels[k].close();
    delete self.fbChannels[k];
  });
};

/**
 * @class PushChannel
 */
function PushChannel(opts) {
  if (!(this instanceof PushChannel)) return new PushChannel(opts);
  events.EventEmitter.call(this);

  var opts = opts || {}
    , popts = opts.push || {};

  this.state = STATE_INIT;
  this.nid = 1; // Align with MQTT, 0 is reserved
  this.c = null;
  this.q = [];
  this.a = []; // ACK cache

  this.keepalive = popts.keepalive || 150;
  this.maxcache = popts.maxcache || 750;

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

PushChannel.prototype.notific = function (tokens, payload, expiry) {
  // Validate inputs
  if (!Array.isArray(tokens)) throw Error('`tokens` is invalid');
  if (!payload) throw Error('`payload` is invalid');

  // Ignore expired notifics
  if (expiry && expiry <= _now()) return;

  var self = this
    , payload_ = new Buffer(JSON.stringify(payload));

  tokens.forEach(function (token) {
    self._notific(token, payload_, expiry);
  });
};

PushChannel.prototype._notific = function (token, payload_, expiry) {
  var self = this
    , note = new Notification();

  try {
    note.device = new Device(token);
    note.payload = payload_;
    note.expiry = expiry;

    // Notific Id
    note.id = this.nid++;

    if (this.nid > 0xffffffff) {
      this.nid = 1; // Align with MQTT, 0 is reserved
    }

  } catch (e) {
    process.nextTick(function () {
      self.emit('invtoken', token);
    });
    return;
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
    // APNS' response, means has error, then we shutdown
    // the socket first.
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

    // Rollbacks
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
      self.emit('invtoken', String(device || ''));
    }
  });

  socket.on('secureConnect', function () {
    util.log('Socket connected!');
  });

  socket.once('timeout', function () {
    socket.destroy();
    util.log('Socket timeout!');
  });

  socket.on('end', function () {
    socket.end();
    util.log('Socket shutdown!');
  });

  socket.on('error', function (err) {
    socket.destroy(); // Workaround on Node's Pipe bug
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
    , socket = this.c
    , q = this.q
    , a = this.a;

  for (var i = 0; ok && i < 64 && q.length; ++i) {
    if (!socket.writable) return;

    var note = q.shift()
      , exp = note.expiry
      , buf;

    if (exp && exp <= now) continue;

    if (!(buf = note.pack())) continue;

    ok = socket.write(buf);
    a.push(note);

    if (a.length > this.maxcache) {
      a.shift();
    }
  }

  // Need recheck states
  if (self.c !== socket) return;

  if (self.state == STATE_READY) {
    self.state = STATE_PAUSE;
    if (ok) schedCycle();
  }

  // Give a chance to read EOF
  function schedCycle() {
    setImmediate(function () {
      if (self.c !== socket) return;

      if (self.state == STATE_PAUSE) {
        self.state = STATE_READY;
        self._flush();
      }
    });
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

/**
 * @class FeedbackChannel
 */
function FeedbackChannel(opts) {
  if (!(this instanceof FeedbackChannel)) return new FeedbackChannel(opts);
  events.EventEmitter.call(this);

  var opts = opts || {}
    , fopts = opts.feedback || {};

  this.state = STATE_INIT;
  this.keepalive = fopts.keepalive || 60;

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
  if (this.state != STATE_INIT) {
    if (cb) process.nextTick(cb.bind(null, []));
    return;
  }

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
    var feeds = {};
    var tim, ep, tok;

    /* Concat buffer */
    if (buff && buff.length) {
      buff = Buffer.concat([buff, data]);
    } else {
      buff = data;
    }

    for (; buff.length > 6; buff = buff.slice(ep)) {
      tim = buff.readUInt32BE(0);
      ep = 6 + buff.readUInt16BE(4);
      // Too short?
      if (buff.length < ep) break;
      else {
        tok = buff.toString('hex', 6, ep);
        feeds[tok] = tim;
      }
    }

    if (tok) {
      if (typeof cb === 'function') cb(feeds);
      self.emit('feedback', feeds);
    }
  });

  socket.on('secureConnect', function () {
    util.log('Socket connected!');
  });

  socket.once('timeout', function () {
    socket.destroy();
    util.log('Socket timeout!');
  });

  socket.on('end', function () {
    socket.end();
    util.log('Socket shutdown!');
  });

  socket.on('error', function (err) {
    socket.destroy(); // Workaround of Node's pipe bug
    util.log('Socket error! - ' + err.message);
  });
};

FeedbackChannel.prototype.close = function () {
  // No-ops
};

/* Internal */
function _now() {
  return Math.floor(Date.now() / 1000);
}

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
