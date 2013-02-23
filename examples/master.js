var zmq = require('zmq')
  , http = require('http')
  , util = require('util');

var config = {
  http: {
    address: '127.0.0.1',
    port: 12320,
  },
  fbs:
    'tcp://127.0.0.1:12321',
  ios: [
    'tcp://127.0.0.1:12330',
  ],
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

// Notific
var mq = {ios: [], droid: []};

// Create ZMQ sockets
(function (types) {
  types.forEach(function (type) {
    config[type].forEach(function (port, i) {
      var z = mq[type][i]
            = zmq.socket('push');

      z.identity = ['master', type, i].join('-');
      z.bindSync(port);
      z.on('error', noop);

      if (zmq.version >= '3.0.0') {
        z.setsockopt(zmq.ZMQ_SNDHWM, 5);
        z.setsockopt(zmq.ZMQ_TCP_KEEPALIVE, 1);
        z.setsockopt(zmq.ZMQ_TCP_KEEPALIVE_IDLE, 150);
      } else {
        z.setsockopt(zmq.ZMQ_HWM, 5);
      }
    });
  });
})(['ios', 'droid']);

// Feedbacks
var fbs = zmq.socket('router')
  , fbl = {ios: {}, droid: {}};

fbs.identity = 'master-fbs';
fbs.bindSync(config['fbs']);
fbs.on('error', noop);

if (zmq.version >= '3.0.0') {
  fbs.setsockopt(zmq.ZMQ_TCP_KEEPALIVE, 1);
  fbs.setsockopt(zmq.ZMQ_TCP_KEEPALIVE_IDLE, 150);
}

// Feedback: [{client: time}, ...]
fbs.on('message', function (envelope, data) {
  // TODO: feedbacks
  // merge to fbl
  fbs.send([envelope, '+OK']);
});

// Create HTTP server
var server = http.createServer(function (req, resp) {
  //if (req.method == 'GET' && req.url != '/feedback') {
    // TODO: return feedbacks according `ostype`
    // clean fbl
  //}

  if (req.method != 'POST' || req.url != '/notific') {
    resp.statusCode = 403;
    resp.end('Forbidden');
    return;
  }

  var chunks = []
    , work;

  req.on('data', function (chunk) {
    chunks.push(chunk);
  });

  req.on('end', function () {
    try {
      work = JSON.parse(Buffer.concat(chunks));
    } catch (e) {}

    if (work) {
      resp.statusCode = 200;
      resp.end('OK');
      dispatch(work);
    } else {
      resp.statusCode = 500;
      resp.end('Internal Server Error');
    }
  });
});

// Work: {ostype, appid, clients, payload, expiry}
function dispatch(work) {
  var os = work.ostype
    , q = mq[os]
    , p = q && q.length
    , splits;

  // Validate input
  if (!p || !work.appid
         || !Array.isArray(work.clients)
         || !work.payload
         || (work.expiry && work.expiry <= _now())) return;

  if (p === 1) {
    splits = [work.clients];
  } else {
    splits = [];
    work.clients.forEach(function (c, i) {
      var h = parseInt(c.slice(-2), 16)
        , i = ((h >> 4) * 13 + (h & 0xf)) % p;
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
        wrktyp: 'notific',
        appid: work.appid,
        clients: a,
        payload: work.payload,
        expiry: work.expiry,
      }));
    }
  });
}

// Start server
server.listen(config['http']['port']
            , config['http']['address']);

/* Internal */
function noop() {}

function _now() {
  return ~~(Date.now() / 1000);
}
