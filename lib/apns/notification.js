/**
 * Create a notification
 * @constructor
 */
function Notification() {
  this.id = 0;
  this.device = null;
  this.expiry = 0;
  this.payload = null;
  this.buffer = null;
};

/**
 * Pack notification into buffer
 */
Notification.prototype.pack = function () {
  var t = this.device && this.device.token
    , m = this.payload
    , l
    , buffer
    , p = 0;

  // Validates
  if (!m || !Buffer.isBuffer(t)) return;

  // Defaults
  if (!this.id) this.id = randid();

  if (Buffer.isBuffer(m)) {
    l = m.length;
  } else {
    if (typeof m !== 'string') {
      m = JSON.stringify(m);
    }
    l = Buffer.byteLength(m);
  }

  // Check length
  if (l > 255) return;

  // Encode packet
  buffer = this.buffer
         = new Buffer(1 + 4 + 4 + 2 + t.length + 2 + l);

  buffer[p] = 1;                          // Command
  p += 1;
  buffer.writeUInt32BE(this.id, p);       // Identifier
  p += 4;
  buffer.writeUInt32BE(this.expiry, p);   // Expiry
  p += 4;
  buffer.writeUInt16BE(t.length, p);      // Token Length
  p += 2;
  p += t.copy(buffer, p);                 // Device Token

  // Payload Length
  buffer.writeUInt16BE(l, p);
  p += 2;

  // Payload
  if (Buffer.isBuffer(m)) {
    m.copy(buffer, p);
  } else {
    buffer.write(m, p);
  }

  return buffer;
};

module.exports = Notification;

/* Privates */
function randid() {
  return ~~(Math.random() * 0xffffffff) + 1; // Align with MQTT, 0 is reserved
}