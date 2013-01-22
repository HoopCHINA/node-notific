var events = require('events')
  , timers = require('timers')
  , util = require('util')
  , http = require('http');

// Work has expiry property
function WorkQueue() {
  if (!(this instanceof WorkQueue)) return new WorkQueue();
  events.EventEmitter.call(this);

  this._workers = [];
  this._q = [];
}
util.inherits(WorkQueue, events.EventEmitter);
exports.WorkQueue = WorkQueue;

WorkQueue.prototype.addWorker = function (worker) {
  var self = this;

  this._workers.push(worker);

  worker.on('ready', function () {
    self._dispatch();
  });

  worker.on('fail', function (work) {
    self._q.unshift(work);
  });

  worker.on('error', function (e) {
    self.emit('error', e);
  });

  if (this._q.length > 0) {
    this._dispatch();
  }
};

WorkQueue.prototype._pick = function () {
  var worker;

  if (this._workers.length <= 1) {
    return this._workers[0];
  }

  this._workers.some(function (w, i, wl) {
    if (w.ready()) {
      worker = w;
      wl.splice(i, 1);
      wl.push(w);
      return true;
    }
  });

  return worker;
};

WorkQueue.prototype.enqueue = function (work) {
  // Check expiry
  if (work.expiry !== undefined && work.expiry <= _now()) return;

  this._q.push(work);

  if (this._q.length === 1) {
    this._dispatch();
  }
};

WorkQueue.prototype.dequeue = function() {
  var now = _now()
    , work;

  while (work = this._q.shift()) {
    if (work.expiry && work.expiry <= _now()) return;
  }
    if (!work) return;

  // body...
};

WorkQueue.prototype.requeue = function(first_argument) {
  // body...
};

WorkQueue.prototype._dispatch = function (work) {
  var worker, work;

  for (;;) {
    worker = this._pick();
    if (!worker) return;

    work = this._q.shift();
    if (!work) return;

    worker.run(work);
  }
};


/* state: Idle, Running, Pause */
function HTTPWorker(opts) {
  if (!(this instanceof HTTPWorker)) return new HTTPWorker(opts);
  events.EventEmitter.call(this);

  this.service = '';
  this.option = {};

  this.pause = false;
  this.works = 0;

  this.agent = http.globalAgent;

  timers.enroll(this, 1000); // Poller, 1s
}
util.inherits(HTTPWorker, events.EventEmitter);
exports.HTTPWorker = HTTPWorker;

Worker.prototype._onTimeout = function() {
  this.pause = false;

  if (this.ready()) {
    this.emit('ready');
  }
};

Worker.prototype.destroy = function () {
  timers.unenroll(this);
};

Worker.prototype.maxWorks = function () {
  return 2 * this.agent.maxSockets + 1;
};

Worker.prototype.ready = function () {
  return !this.pause && this.works <= this.maxWorks();
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
    self.works--;

    if (resp.statusCode !== 200) {
      needEmit = false;
      _pause();
      self.emit('fail', work);
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

// Internal
function _now() {
  return ~~(Date.now() / 1000);
}
