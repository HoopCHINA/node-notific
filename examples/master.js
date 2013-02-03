var zmq = require('zmq')
  , http = require('http')
  , util = require('util');

var config = {
  http: {
    address: '127.0.0.1',
    port: 12320,
  },
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
  ios: [
    'tcp://127.0.0.1:12330',
  ],
};

var mq = {droid: [], ios: []};

// Create ZMQ sockets
(function (types) {
  types.forEach(function (type) {
    config[type].forEach(function (port, i) {
      var s = mq[type][i]
            = zmq.socket('push');

      s.identity = ['upstream', type, i].join('-');
      s.bindSync(port);

      if (zmq.version >= '3.0.0') {
        s.setsockopt(zmq.ZMQ_SNDHWM, 5);
        s.setsockopt(zmq.ZMQ_TCP_KEEPALIVE, 1);
        s.setsockopt(zmq.ZMQ_TCP_KEEPALIVE_IDLE, 150);
      } else {
        s.setsockopt(zmq.ZMQ_HWM, 5);
      }
    });
  });
})(['droid', 'ios']);

// Create HTTP server
var server = http.createServer(function (req, resp) {
  if (req.method !== 'POST' || req.url !== '/work') {
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
function _now() {
  return ~~(Date.now() / 1000);
}
