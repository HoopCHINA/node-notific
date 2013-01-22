var events = require('events')
  , timers = require('timers')
  , util = require('util')
  , http = require('http');

// Work has expire, dup properties
function WorkQueue() {
  if (!(this instanceof WorkQueue)) return new WorkQueue();
  events.EventEmitter.call(this);

  this._history = {};
  this._gc = false;

  timers.enroll(this, 60*1000); // GC per 60s
}
util.inherits(WorkQueue, events.EventEmitter);
exports.WorkQueue = WorkQueue;

WorkQueue.prototype._onTimeout = function () {
  this.gc();
};

WorkQueue.prototype.close = function () {
  timers.unenroll(this);
};

// work.id
WorkQueue.prototype.enqueue = function (work) {
  var now = _now()
    , history = this._history;

  // Check expiry
  if (work.expiry !== undefined && work.expiry <= now) return;
  // Check dup
  if (work.dup && history[work.id] !== undefined) return;

  history[work.id] = now + 60;

  this.emit('work', work);

  if (!this._gc) {
    timers.active(this);
    this._gc = true;
  }
};

WorkQueue.prototype.pipe = function (worker) {
  this.on('work', function (work) {
    worker.run(work);
  });
};

WorkQueue.prototype.gc = function () {
  var now = _now()
    , history = this._history
    , count = 0;

  this._gc = false;

  Object.keys(history).forEach(function (k) {
    if (history[k] <= now)
      delete history[k];
    else {
      count++;
    }
  });

  if (count > 0) {
    timers.active(this);
    this._gc = true;
  }
};


function LoadBalancer() {
  if (!(this instanceof LoadBalancer)) return new LoadBalancer();
  events.EventEmitter.call(this);

  this._workers = [];
  this._q = [];
}
util.inherits(LoadBalancer, events.EventEmitter);
exports.LoadBalancer = LoadBalancer;

LoadBalancer.prototype.addWorker = function (worker) {
  var self = this;

  this._workers.push(worker);

  worker.on('ready', function () {
    self._dispatch();
  });

  worker.on('fail', function (work) {
    work.dup = true;
    self._q.unshift(work);
  });

  if (this._q.length > 0) {
    this._dispatch();
  }
};

LoadBalancer.prototype._pick = function () {
  var worker;

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

LoadBalancer.prototype.run = function (work) {
  this._q.push(work);

  if (this._q.length === 1) {
    this._dispatch();
  }
};

LoadBalancer.prototype._dispatch = function (work) {
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
