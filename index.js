var mqtt = require('./lib/mqtt')
  , apns = require('./lib/apns');

// TODO: Flow control

// TODO: Redirector, use DNS#53 port to help with firewall
// ...
// UDP redirector need use session validation
// device 需要生成一个 random, 服务端回应 ~random...
// device 需验证
// ...
// 直接使用 DNS 技术... OK 了...
// 使用 SRV 记录, 使用脚本生成 映射配置文件...

function Distributor(opts) {
  this.http_server = http.createServer(this._handler.bind(this));
}

Distributor.prototype._handler(req, resp) {
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

function TaskQueue() {
  this.q = [];
  this.i = [];
};

// taskid = uint32
TaskQueue.prototype.enqueue = function (task) {
  // Check dup task
  if (task.dup && ~this.i.lastIndexOf(task.id)) return;

  task.dup = 0;
  this.q.push(task);
  this.i.push(task.id);
  if (this.i.length >= 1000) {
    this.i.splice(0, 100);
  }
  this.emit('task', task);
};

TaskQueue.prototype.reserve = function () {
  return this.q.shift();
};

/* state: Idle, Running, Pause */
function Worker(opts) {
  this.service = '';
  this.option = {};

  this.pause = false;
  this.works = 0;

  this.agent = http.globalAgent;

  timers.enroll(this, 1000); // Poller, 1s
}

Worker.prototype._onTimeout = function() {
  this.pause = false;

  if (this.ready()) {
    this.emit('ready');
  }
};

Worker.prototype.maxWorks = function () {
  return 2 * this.agent.maxSockets + 1;
};

Worker.prototype.ready = function () {
  return !this.pause && this.works <= this.maxWorks();
};

Worker.prototype.release = function () {
  timers.unenroll(this);
};

Worker.prototype.run = function (work) {
  var self = this
    , needEmit = true;

  function _pause() {
    self.pause = true;
    timers.active(self);
  }

  function _resume() {
    if (!self.pause) return;
    self.pause = false;
    timers.unenroll(self);
  }

  function _error() {
    if (needEmit) {
      self.works--;
      needEmit = false;
      _pause();
      self.emit('fail', work);
    }
  }

  self.works++;

  var req = http.request(opts, function (resp) {
    if (resp.statusCode !== 200) {
      _error();
      return;
    }

    self.works--;
    needEmit = false;

    if (resp.headers['x-pause'] !== undefined) {
      _pause();
    } else {
      _resume();
      self.emit('ready');
    }
  });

  req.setTimeout(self.timeout);
  req.setNoDelay();

  req.on('timeout', _error);
  req.on('error', _error);

  req.write('task-data');
  req.end();
};

function dispatch_work() {
  var worker, work;

  for (;;) {
    worker = get_worker();
    if (!worker) return;

    work = workq.reserve();
    if (!work) {
      workq.once('work', dispatch_work);
      return;
    }

    worker.run(work);
  }
}

workq.once('work', dispatch_work);

worker.on('ready', dispatch_work);

worker.on('fail', function (work) {
  workq.enqueue(work);
});

function MQTTWorker(opts) {

}

function APNSWorker(opts) {

}
