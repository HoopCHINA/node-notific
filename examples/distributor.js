var http = require('http')
  , workq = require('../lib/workq');

var queue = new workq.WorkQueue()
  , mqtt = new workq.WorkQueue()
  , lb = new workq.LoadBalancer(mqtt);

queue.on('work', function (work) {
  // pre-process
  mqtt.enqueue(work);
});

lb.addWorker(new HTTPWorker(url));
lb.addWorker(new HTTPWorker(url2));

lb.on('fail', function (work) {
  mqtt.enqueue(work);
});

lb.on('ready', dispatch_work);

mqtt.on('work', dispatch_work);

function dispatch_work() {
  var worker, work;

  for (;;) {
    worker = lb.pick();
    if (!worker) return;

    work = workq.reserve();
    if (!work) return;

    worker.run(work);
  }
}

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
