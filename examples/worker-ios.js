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

var mq = zmq.socket('pull')
  , rpc = zmq.socket('dealer')
  , id = Number(process.argv[2]) || 0
  , agent = apns.createAgent(config['apns']);

// Config ZMQ sockets
mq.identity = rpc.identity
            = ['worker', 'ios', id].join('-');

mq.connect(config['ios']);
rpc.connect(config['rpc']);
_zmqDefault(mq);
_zmqDefault(rpc);

// Work: {typ, app, tokens, payload, expiry}
mq.on('message', function (data) {
  try {
    var work = JSON.parse(data);

    if (work && work.typ == 'notific') {
      agent.notific(work.app, work.tokens
                  , work.payload, work.expiry);
    }
  } catch (e) {
    util.log('Message error! - ' + e.message);
  }
});

agent.on('invtoken', function (app, token) {
  rpc.send(JSON.stringify({
    os: 'ios',
    c: 'invtoken',
    app: app,
    tok: token,
  }));
});

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
