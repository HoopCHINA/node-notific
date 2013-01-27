var zmq = require('zmq');

var config = {
  http: {
    address: '127.0.0.1',
    port: 12320,
  },
  mqtt: [
    'tcp://127.0.0.1:12340',
    'tcp://127.0.0.1:12341',
    'tcp://127.0.0.1:12342',
    'tcp://127.0.0.1:12343',
    'tcp://127.0.0.1:12344',
    'tcp://127.0.0.1:12345',
    'tcp://127.0.0.1:12346',
    'tcp://127.0.0.1:12347',
  ],
  apns: [
    'tcp://127.0.0.1:12330',
  ],
};

var wq = workq.WorkQueue();
  , mq = {mqtt: [], apns: []};

// Work: {ostype, appid, clients, payload, expiry}
wq.on('work', function (work) {
  var os = work.ostype
    , queues = mq[os]
    , qnum = queues.length
    , splits;

  if (qnum === 0) return;

  splits = [];

  if (qnum === 1) {
    splits[0] = c;
  } else {
    work.clients.forEach(function (c) {
      var h = _hash(c, qnum);
      if (!splits[h]) splits[h] = [];
      splits[h].push(c);
    });
  }

  splits.forEach(function (a, i) {
    var socket = queues[i]
      , w_;

    if (socket) {
      w_ = {
        appid: work.appid,
        clients: a,
        payload: work.payload,
        expiry: work.expiry,
      };
      socket.send(msgpack.pack(w_));
    }
  });
});

// Create ZMQ sockets
(function (types) {
  types.forEach(function (type) {
    config[type].forEach(function (port, i) {
      var socket = mq[type][i] = zmq.socket('push');
      socket.identity = ['upstream', type, i].join('-');
      socket.bindSync(port);

      if (zmq.version >= '3.0.0') {
        socket.setsockopt(zmq.ZMQ_SNDHWM, 5);
        socket.setsockopt(zmq.ZMQ_TCP_KEEPALIVE, 1);
        socket.setsockopt(zmq.ZMQ_TCP_KEEPALIVE_IDLE, 150);
      } else {
        socket.setsockopt(zmq.ZMQ_HWM, 5);
      }
    });
  });
})(['mqtt', 'apns']);

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

    if (!work) {
      resp.statusCode = 500;
    } else {
      wq.enqueue(work);
      resp.statusCode = 200;
    }

    resp.end();
  });
});

server.listen(config['http']['port']
            , config['http']['address']);
