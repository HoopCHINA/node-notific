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

function taskq.dispatch_next() {
  // get task
  // if no task return;

  // request
  var req = http.request(opts, function (res) {
    if (res.code === 200) {
      // OK
      taskq.dispatch_next();
    } else {
      // ERROR
      // wait a while {
        taskq.dispatch_next();
      //}
    }
  });

  req.setTimeout(TIMEOUT, end);
  req.setNoDelay();

  req.on('error', function () {
    // put back task
  });

  req.write('task-data');
  req.end();
}

function gc() {
  // clear expired task
}

function MQTTWorker(opts) {

}

function APNSWorker(opts) {

}
