var zmq = require('zmq')
  , mq = zmq.socket('pull')
  , notific = require('../')
  , remote_end = 'tcp://127.0.0.1:3000';

mq.identity = 'apns';
mq.connect(remote_end);

mq.on('message', function (data) {
  //console.log(mq.identity + ': received data ' + data.toString());
  var job = JSON.parse(data.toString());
  notific.apns(job.appid, job.tokens, job.payload, job.expiry);
});
