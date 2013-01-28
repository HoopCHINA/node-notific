var zmq = require('zmq')
  , http = require('http')
  , util = require('util')
  , workq = require('../lib/workq')
  , mqtt = require('../lib/mqtt');

var config = {
  master: 'tcp://127.0.0.1:12330',
  http: {
    address: '127.0.0.1',
    port: 12320,
  },
};

var wq = workq.WorkQueue()
  , mq = zmq.socket('pull')
  , id = Number(process.argv[2]) || 0;

// Work: {appid, clients, payload, expiry}
wq.on('work', function (work) {
  if (!work.appid
      || !Array.isArray(work.clients)
      || !work.payload) return;

  apns.notific(work.appid, work.clients,
               work.payload, work.expiry);
});

// Config ZMQ sockets
mq.identity = ['worker', 'ios', id].join('-');
mq.connect(config['master']);

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
    if (work) wq.enqueue(work);
  } catch (e) {
    util.log('Message error! - ' + e.message);
  }
});
