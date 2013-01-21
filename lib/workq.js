var http = require('http')
  , util = require('util');

function WorkQueue(opts) {
  this.workers = [];
  this.q = [];
  this.i = [];
}

WorkQueue.prototype.addWorker = function (worker) {
  var self = this;

  worker.on('ready', function () {
    self._dispatch();
  });

  worker.on('fail', function (work) {
    self.enqueue(work);
  });

  self._dispatch();
};

// work.id = uint32
WorkQueue.prototype.enqueue = function (work) {
  // Check dup work
  if (work.dup && ~this.i.lastIndexOf(work.id)) return;
  delete work['dup'];

  var idle = this.q.length === 0;

  this.i.push(work.id);
  this.q.push(work);

  if (idle) this._dispatch();

  if (this.i.length >= 1000) {
    this.i.splice(0, 100);
  }
};

WorkQueue.prototype._pickWorker = function(first_argument) {
  // body...
};

WorkQueue.prototype._dispatch = function () {
  var worker, work;

  for (;;) {
    worker = this._pickWorker();
    if (!worker) return;

    work = this.q.shift();
    if (!work) return;

    worker.run(work);
  }
};

/* state: Idle, Running, Pause */
function RemoteWorker(opts) {
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
