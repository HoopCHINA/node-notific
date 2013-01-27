var events = require('events')
  , util = require('util');

// Work has `expiry` property
function WorkQueue() {
  if (!(this instanceof WorkQueue)) return new WorkQueue();
  events.EventEmitter.call(this);
}
util.inherits(WorkQueue, events.EventEmitter);
exports.WorkQueue = WorkQueue;

WorkQueue.prototype.enqueue = function (work) {
  if (work.expiry && work.expiry <= _now()) return;
  this.emit('work', work);
};

/* Internal */
function _now() {
  return ~~(Date.now() / 1000);
}
