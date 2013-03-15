/* Copyright (c) 2013 Wang Wenlin. See LICENSE for more information */

var zmq = require('zmq')
  , util = require('util')
  , semver = require('semver')
  , restify = require('restify');

// TODO: More advanced flow control

var config = {
  http: {
    address: '127.0.0.1',
    port: 12320,
  },
  rpc:
    'tcp://127.0.0.1:12321',
  ios:
    'tcp://127.0.0.1:12330',
  droid: [
    'tcp://127.0.0.1:12340',
    'tcp://127.0.0.1:12341',
    'tcp://127.0.0.1:12342',
    'tcp://127.0.0.1:12343',
    'tcp://127.0.0.1:12344',
    'tcp://127.0.0.1:12345',
    'tcp://127.0.0.1:12346',
    'tcp://127.0.0.1:12347',
  ],
};

// ZMQ sockets
var rpc = _zmqMake('router', config['rpc']);

var mq = {
  ios: _zmqMake('push', config['ios']),

  droid: config['droid'].map(function (adr) {
    return _zmqMake('push', adr);
  }),
};

// ZMQ feed store
var store = {
  ios: {exp: {}, inv: {}},
  droid: {exp: {}},
};

// ZMQ rpc handler
var rpcHandler = {
  ios: {
    feedback: function (msg) {
      var app = msg.app
        , feeds = msg.feeds
        , exp = store.ios.exp;

      if (!app || !feeds) return;

      if (!exp[app]) exp[app] = feeds;
      else {
        Array.prototype.push.apply(exp[app], feeds);
      }
    },

    invtoken: function (msg) {
      var app = msg.app
        , tok = msg.tok
        , inv = store.ios.inv;

      if (!app || !tok) return;

      if (!inv[app]) inv[app] = [tok];
      else {
        inv[app].push(tok);
      }
    },
  },

  droid: {
    feedback: function (msg) {
      var app = msg.app
        , feeds = msg.feeds
        , exp = store.droid.exp;

      if (!app || !feeds) return;

      if (!exp[app]) exp[app] = feeds;
      else {
        Array.prototype.push.apply(exp[app], feeds);
      }
    },
  },
};

// RPC: {os, c, app, tok}
rpc.on('message', function (envelope, data) {
  try {
    var msg = JSON.parse(data) || {}
      , os = msg.os || ''
      , c = msg.c || ''
      , fn = rpcHandler[os] && rpcHandler[os][c];

    if (fn) fn(msg);

  } catch (e) {
    util.log('Message error! - ' + e.message);
  }
});

// Create REST server
var server = restify.createServer({name: 'node-notific'});

var restHandler = {
  ios: {
    // Work: {tokens, payload, expiry}
    notific: function (req, resp, next) {
      var z = mq.ios
        , app = req.params.app
        , work = req.body || {};

      // Validate
      if (!z || !app
             || !Array.isArray(work.tokens)
             || !work.payload
             || (work.expiry && work.expiry <= _now())) return;

      z.send(JSON.stringify({
        typ: 'notific',
        app: app,
        tokens: work.tokens,
        payload: work.payload,
        expiry: work.expiry,
      }));

      resp.send('+OK');
    },

    feedback: function (req, resp, next) {
      var app = req.params.app
        , exp = store.ios.exp;

      if (exp[app]) {
        resp.send(exp[app]);
        exp[app] = null;
      } else {
        resp.send([]);
      }
    },

    invtoken: function (req, resp, next) {
      var app = req.params.app
        , inv = store.ios.inv;

      if (inv[app]) {
        resp.send(inv[app]);
        inv[app] = null;
      } else {
        resp.send([]);
      }
    },
  },

  droid: {
    // Work: {clients, payload, expiry}
    notific: function (req, resp, next) {
      var q = mq.droid
        , l = q && q.length
        , app = req.params.app
        , work = req.body || {}
        , splits;

      // Validate
      if (!l || !app
             || !Array.isArray(work.clients)
             || !work.payload
             || (work.expiry && work.expiry <= _now())) return;

      if (l === 1) {
        splits = [work.clients];
      } else {
        splits = [];
        work.clients.forEach(function (c, i) {
          var h = parseInt(c.slice(-2), 16)
            , i = ((h >> 4) * 13 + (h & 0xf)) % l;
          if (!splits[i]) {
            splits[i] = [c];
          } else {
            splits[i].push(c);
          }
        });
      }

      splits.forEach(function (a, i) {
        var z = q[i];
        if (z) {
          z.send(JSON.stringify({
            typ: 'notific',
            app: app,
            clients: a,
            payload: work.payload,
            expiry: work.expiry,
          }));
        }
      });

      resp.send('+OK');
    },

    feedback: function (req, resp, next) {
      var app = req.params.app
        , exp = store.droid.exp;

      if (exp[app]) {
        resp.send(exp[app]);
        exp[app] = null;
      } else {
        resp.send([]);
      }
    },
  },
};

// Config and Routes
server.use(restify.bodyParser({ mapParams: false }));

server.post('/ios/notific/:app', restHandler.ios.notific);
server.get('/ios/feedback/:app', restHandler.ios.feedback);
server.get('/ios/invtoken/:app', restHandler.ios.invtoken);

server.post('/droid/notific/:app', restHandler.droid.notific);
server.get('/droid/feedback/:app', restHandler.droid.feedback);

// Start server
server.listen(config['http']['port']
            , config['http']['address']);

/* Internal */
function noop() {}

function _now() {
  return Math.floor(Date.now() / 1000);
}

function _zmqMake(typ, adr) {
  var z = zmq.socket(typ);

  z.identity = 'master';
  z.bindSync(adr);
  z.on('error', noop);

  if (semver.satisfies(zmq.version, '3.x')) {
    z.setsockopt(zmq.ZMQ_SNDHWM, 5);
    z.setsockopt(zmq.ZMQ_TCP_KEEPALIVE, 1);
    z.setsockopt(zmq.ZMQ_TCP_KEEPALIVE_IDLE, 150);
  } else {
    z.setsockopt(zmq.ZMQ_HWM, 5);
  }

  return z;
}
