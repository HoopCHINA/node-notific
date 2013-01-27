var workq = require('../lib/workq')
  , http = require('http');

var queue = new workq.WorkQueue()
  , apns = new apns.NotificServer();

queue.on('work', function (work) {
  // pre-process
  apns.notific(work, expiry);
});

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
      work = msgpack.unpack(Buffer.concat(chunks));
    } catch (e) {}

    if (!work) {
      resp.statusCode = 500;
    } else {
      queue.enqueue(work);
      resp.statusCode = 200;
    }

    resp.end();
  });
});

server.bind(3001, '127.0.0.1');
