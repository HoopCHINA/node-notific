/**
 * Creates a Device.
 * @constructor
 * @param {String|Buffer} token Device token
 */
function Device(deviceToken) {
  if (!Buffer.isBuffer(deviceToken)) {
    this.token = new Buffer(deviceToken.replace(/\s/g, ''), 'hex');
  } else {
    this.token = deviceToken;
  }
}
module.exports = Device;

/**
 * @returns {String} Device token in hex string representation
 * @since v1.2.0
 */
Device.prototype.toString = function () {
  return this.token.toString('hex');
}