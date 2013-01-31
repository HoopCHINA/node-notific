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


function NotificServer(opts) {
  ;
}

NotificServer.prototype.notific = function () {
  // body...
};

function Connection() {
  // body...
  this.buffer = [];
  this.cache = [];

  this.socket = socket;
  this.socket.connect(a, b, this._handler.bind(this));
}

active() {
  this.
}

dispatch () {
  if (qq)
  this.active(function () {
    ;
  });
}

LoadBalancer.prototype._pick = function () {
  var worker;

  if (w.ready()) {
    return worker;
  }

  return worker;
};

LoadBalancer.prototype.run = function (work) {
  this._q.push(work);

  if (this._q.length === 1) {
    this._dispatch();
  }
};


ready() {
  if (pause)
}

WorkQueue.prototype._dispatch = function () {
  if (channel.flushing) return;

  channel.k = true;
  var push, note;

  while (channel.q.length) {
    this._pick(appid, function (channel) {
      var note = channel.q.shift();
      if (!note) return;
    });
    if (!push) return;

    note = this.q.shift();
    if (!note) return;

    push.notific(note);
  }

  channel.k = 0;
};

socket.once('drain')

socket.on('close', function () {
  self.pause = 0;
});

notific(note) {
  socket.write(note);
  if (is_false) {
    this.pause = 1;
    socket.once('drain', function () {
      this.pause = 0;
      self._dispatch();
    });
  }
}

c.once('drain', function () {
  self._dispatch();
});


this.channels = {};

this.enqueue = function (note) {
  ...;
  this._dispatch();
};

_dispatch(x) {
  xx
}







function active(channel, cb) {
  var c = channel.c;
  if (c && c.writable) return;

  c = channel.c = socket();
  c.connect();

  socket.on('error', ...);
  socket.on('close', ...);
  socket.on('timeout', ...);
}



function Channel() {
  this.q = [];
  this.a = [];
  this.c = null;
  this.e = 0;
  this.overflow = false;
  this.flushing = false;
  this.key = null;
  this.cert = null;
}

ready() {
  return this.c && this.c.writable && this.overflow;
}

var STATE_IDLE = 0
  , STATE_LOADING = 1
  , STATE_LOADED = 2
  , STATE_CONNECTING = 3
  , STATE_READY = 4
  , STATE_PAUSE = 5
  , STATE_CLOSED = 6
  , STATE_ERROR = -1;

function Channel(opts) {
  this.state = STATE_IDLE;
  this.keepalive = 300*1000;

  this.mid = 0;

  this.c = null;
  this.q = [];
  this.a = [];

  if (this.key && this.cert) {
    this.state = STATE_LOADED;
  } else {
    this._loadCert();
  }
}

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
  note.id = this.mid++;

  // Loop mid
  if (this.mid > 0xffffffff) {
    this.mid = 0;
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
    // Destroy first
    socket.destroy();

    if (data[0] != 8) return;

    var code = data[1]
      , id = data.readUInt32BE(2);

    this.a.some(function () {
      if note.id == id;
      splice();
      emit('error', note);
      return true;
    });

    this.q = this.q.concat(this.a);
    this.a = [];
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
