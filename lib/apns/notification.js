/**
 * Create a notification
 * @constructor
 */
function Notification() {
  this.encoding = 'utf8';
  this.id = 0;
  this.device = null;
  this.expiry = 0;
  this.payload = null;
  this.buffer = null;
};

/**
 * Pack notification to buffer
 */
Notification.prototype.pack = function () {
  var t = this.device && this.device.token
    , m, l
    , buffer
    , p = 0;

  // Validates
  if (!this.payload || !Buffer.isBuffer(t)) return;

  // Packing
  m = JSON.stringify(this.payload);
  l = Buffer.byteLength(m, this.encoding);

  if (l > 255) return;

  buffer = this.buffer
         = new Buffer(1 + 4 + 4 + 2 + t.length + 2 + l);

  // Encode packet
  buffer[p] = 1;                          // Command
  p += 1;
  buffer.writeUInt32BE(this.id, p);       // Identifier
  p += 4;
  buffer.writeUInt32BE(this.expiry, p);   // Expiry
  p += 4;
  buffer.writeUInt16BE(t.length, p);      // Token Length
  p += 2;
  p += t.copy(buffer, p);                 // Device Token
  buffer.writeUInt16BE(l, p);             // Payload Length
  p += 2;
  p += buffer.write(m, p, this.encoding); // Payload

  return buffer;
};

module.exports = Notification;