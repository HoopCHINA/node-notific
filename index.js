var mqtt = require('./lib/mqtt')
  , apns = require('./lib/apns');

function Producer(opts) {
  this.http_server = http.createServer(this._handler.bind(this));
}

Producer.prototype._handler(req, resp) {
  var action
    , chunks = [];

  switch (req.url) {
    case '/apns':
      action = _apns;
      break;

    case '/mqtt':
      action = _mqtt;
      break;

    default:
      resp.end();
      return;
  }

  req.on('data', function (chunk) {
    chunks.push(chunk);
  });

  req.on('end', function () {
    var json = Buffer.concat(chunks).toString();

    if (json) {
      var data = JSON.parse(json);
      resp.end(action(data));
    }
  });

  function _apns(data) {

  }

  function _mqtt(data) {
    
  }
};

function MQTTWorker(opts) {

}

function APNSWorker(opts) {

}

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


function Producer