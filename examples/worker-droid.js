var zmq = require('zmq')
  , http = require('http')
  , util = require('util')
  , mqtt = require('../').mqtt;

var config = {
  http: {
    address: '127.0.0.1',
    port: 12320,
  },
  mqtt: [
    {address: '127.0.0.1', port: 3080},
    {address: '127.0.0.1', port: 3081},
    {address: '127.0.0.1', port: 3082},
    {address: '127.0.0.1', port: 3083},
    {address: '127.0.0.1', port: 3084},
    {address: '127.0.0.1', port: 3085},
    {address: '127.0.0.1', port: 3086},
    {address: '127.0.0.1', port: 3087},
  ],
  endp: [
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

var mq = zmq.socket('pull')
  , id = Number(process.argv[2]) || 0
  , push = mqtt.createServer({id: id});

// Config ZMQ sockets
mq.identity = ['worker', 'droid', id].join('-');
mq.connect(config['endp'][id]);

if (zmq.version >= '3.0.0') {
  mq.setsockopt(zmq.ZMQ_RCVHWM, 5);
  mq.setsockopt(zmq.ZMQ_TCP_KEEPALIVE, 1);
  mq.setsockopt(zmq.ZMQ_TCP_KEEPALIVE_IDLE, 150);
} else {
  mq.setsockopt(zmq.ZMQ_HWM, 5);
}

// Work: {appid, clients, payload, expiry}
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

// Start push notific server
push.listen(config['mqtt'][id]['port']
          , config['mqtt'][id]['address']);
