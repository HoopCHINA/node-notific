var zmq = require('zmq')
  , http = require('http')
  , util = require('util')
  , apns = require('../').apns;

var config = {
  http: {
    address: '127.0.0.1',
    port: 12320,
  },
  apns: {
    'com.hupu.GameMate': {
      keyfile: 'certs/key.pem',
      certfile: 'certs/cert.pem',
      keepalive: 300,
      maxcache: 200,
    },
  },
  endp: 'tcp://127.0.0.1:12330',
};

var mq = zmq.socket('pull')
  , id = Number(process.argv[2]) || 0
  , push = apns.createAgent(config['apns']);

// Config ZMQ sockets
mq.identity = ['worker', 'ios', id].join('-');
mq.connect(config['endp']);

if (zmq.version >= '3.0.0') {
  mq.setsockopt(zmq.ZMQ_RCVHWM, 5);
  mq.setsockopt(zmq.ZMQ_TCP_KEEPALIVE, 1);
  mq.setsockopt(zmq.ZMQ_TCP_KEEPALIVE_IDLE, 150);
} else {
  mq.setsockopt(zmq.ZMQ_HWM, 5);
}

mq.on('message', function (data) {
  try {
    var work = JSON.parse(data);
    if (work && work.wrktyp == 'notific') {
      push.notific(work.appid, work.clients
                 , work.payload, work.expiry);
    }
  } catch (e) {
    util.log('Message error! - ' + e.message);
  }
});
