var zmq = require('zmq')
  , util = require('util')
  , semver = require('semver')
  , mqtt = require('../').mqtt;

var config = {
  http: {
    address: '127.0.0.1',
    port: 12320,
  },
  rpc:
    'tcp://127.0.0.1:12321',
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
};

var mq = zmq.socket('pull')
  , rpc = zmq.socket('dealer')
  , id = Number(process.argv[2]) || 0
  , svr = mqtt.createServer({id: id});

// Config ZMQ sockets
mq.identity = rpc.identity
            = ['worker', 'droid', id].join('-');

mq.connect(config['droid'][id]);
rpc.connect(config['rpc']);
_zmqDefault(mq);
_zmqDefault(rpc);

// Work: {typ, app, clients, payload, expiry}
mq.on('message', function (data) {
  try {
    var work = JSON.parse(data);

    if (work && work.typ == 'notific') {
      svr.notific(work.app, work.clients
                , work.payload, work.expiry);
    }
  } catch (e) {
    util.log('Message error! - ' + e.message);
  }
});

svr.on('feedback', function (app, feeds) {
  rpc.send(JSON.stringify({
    os: 'droid',
    c: 'feedback',
    app: app,
    feeds: feeds,
  }));
});

// Start push notific server
svr.listen(config['mqtt'][id]['port']
         , config['mqtt'][id]['address']);

/* Internal */
function noop() {}

function _zmqDefault(z) {
  z.on('error', noop);

  if (semver.satisfies(zmq.version, '3.x')) {
    z.setsockopt(zmq.ZMQ_SNDHWM, 5);
    z.setsockopt(zmq.ZMQ_TCP_KEEPALIVE, 1);
    z.setsockopt(zmq.ZMQ_TCP_KEEPALIVE_IDLE, 150);
  } else {
    z.setsockopt(zmq.ZMQ_HWM, 5);
  }
}
