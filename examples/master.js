var zmq = require('zmq')
  , http = require('http')
  , workq = require('../lib/workq');

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

var wq = workq.WorkQueue()
  , mq = {droid: [], ios: []};

// Work: {ostype, appid, clients, payload, expiry}
wq.on('work', function (work) {
  var os = work.ostype
    , q = mq[os]
    , p = q && q.length
    , splits;

  if (!p || !work.appid
         || !Array.isArray(work.clients)
         || !work.payload) return;

  if (p === 1) {
    splits = [work.clients];
  } else {
    splits = [];
    work.clients.forEach(function (c, i) {
      var h = parseInt(c.slice(-2), 16) % p;
      if (!splits[h]) {
        splits[h] = [c];
      } else {
        splits[h].push(c);
      }
    });
  }

  splits.forEach(function (a, i) {
    var s = q[i];
    if (s) {
      s.send(JSON.stringify({
        appid: work.appid,
        clients: a,
        payload: work.payload,
        expiry: work.expiry,
      }));
    }
  });
});

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
  if (req.url !== '/work') {
    resp.end();
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
      wq.enqueue(work);
    } else {
      resp.statusCode = 500;
    }

    resp.end();
  });
});

// Start server
server.listen(config['http']['port']
            , config['http']['address']);
