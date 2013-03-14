var zmq = require('zmq')
  , util = require('util')
  , apns = require('../').apns;

var config = {
  http: {
    address: '127.0.0.1',
    port: 12320,
  },
  rpc:
    'tcp://127.0.0.1:12321',
  ios:
    'tcp://127.0.0.1:12330',
  apns: {
    'com.hupu.GameMate': {
      keyfile: 'certs/key.pem',
      certfile: 'certs/cert.pem',
      push: {
        keepalive: 300,
        maxcache: 500,
      },
      feedback: {
        keepalive: 60,
      },
    },
  },
};

var rpc = zmq.socket('dealer')
  , id = Number(process.argv[2]) || 0
  , agent = apns.createAgent(config['apns'])
  , apps = Object.keys(config['apns']);

// Config ZMQ sockets
rpc.identity = ['worker', 'fb', id].join('-');
rpc.connect(config['rpc']);
_zmqDefault(rpc);

agent.on('feedback', function (app, feeds) {
  rpc.send(JSON.stringify({
    os: 'ios',
    c: 'feedback',
    app: app,
    feeds: feeds,
  }));
});

if (apps.length) {
  var intv = ~~(30*60 / apps.length);

  setInterval(function () {
    var app = apps.shift();
    apps.push(app);
    agent.feedback(app);
  }, intv * 1000);
}

/* Internal */
function noop() {}

function _zmqDefault(z) {
  z.on('error', noop);

  if (zmq.version >= '3.0.0') {
    z.setsockopt(zmq.ZMQ_SNDHWM, 5);
    z.setsockopt(zmq.ZMQ_TCP_KEEPALIVE, 1);
    z.setsockopt(zmq.ZMQ_TCP_KEEPALIVE_IDLE, 150);
  } else {
    z.setsockopt(zmq.ZMQ_HWM, 5);
  }
}
