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
 * Clone a notification to send to multiple devices
 * @param {Device} [device] Device the notification will be sent to
 * @returns {Notification} A notification containing the same properties as the receiver
 * @since v1.2.0
 */
Notification.prototype.clone = function () {
  var n = new Notification();

  n.encoding = this.encoding;
  n.id = this.id;
  n.device = this.device;
  n.expiry = this.expiry;
  n.payload = this.payload;
  n.buffer = this.buffer;

  if (this.alert !== undefined)
    n.alert = this.alert;
  if (this.badge !== undefined)
    n.badge = this.badge;
  if (this.sound !== undefined)
    n.sound = this.sound;
  if (this.newsstandAvailable !== undefined)
    n.newsstandAvailable = this.newsstandAvailable;

  return n;
}

/**
 * Set the alert text for the notification
 * @param {String} alertText The text of the alert message.
 * @see The <a href='https://developer.apple.com/library/ios/#documentation/NetworkingInternet/Conceptual/RemoteNotificationsPG/ApplePushService/ApplePushService.html#//apple_ref/doc/uid/TP40008194-CH100-SW1'>Payload Documentation</a>
 * @since v1.2.0
 */
Notification.prototype.setAlertText = function (text) {
  if (typeof this.alert !== 'object') {
    this.alert = text;
  } else {
    this.prepareAlert();
    this.alert['body'] = text;
  }
}

/**
 * Set the action-loc-key property on the alert object
 * @param {String} [key] If a string is specified, displays an alert with two buttons, whose behavior is described in Table 3-1. However, iOS uses the string as a key to get a localized string in the current localization to use for the right button’s title instead of “View”. If the value is null, the system displays an alert with a single OK button that simply dismisses the alert when tapped.
 * @see The <a href='https://developer.apple.com/library/ios/#documentation/NetworkingInternet/Conceptual/RemoteNotificationsPG/ApplePushService/ApplePushService.html#//apple_ref/doc/uid/TP40008194-CH100-SW1'>Payload Documentation</a>
 * @since v1.2.0
 */
Notification.prototype.setActionLocKey = function (key) {
  this.prepareAlert();
  this.alert['action-loc-key'] = key;
}

/**
 * Set the loc-key parameter on the alert object
 * @param {String} [key] A key to an alert-message string in a Localizable.strings file for the current localization (which is set by the user’s language preference).
 * @see The <a href='https://developer.apple.com/library/ios/#documentation/NetworkingInternet/Conceptual/RemoteNotificationsPG/ApplePushService/ApplePushService.html#//apple_ref/doc/uid/TP40008194-CH100-SW1'>Payload Documentation</a>
 * @since v1.2.0
 */
Notification.prototype.setLocKey = function (key) {
  this.prepareAlert();
  if(!key) {
    delete this.alert['loc-key'];
    return;
  }
  this.alert['loc-key'] = key;
}

/**
 * Set the loc-args parameter on the alert object
 * @param {String[]} [args] Variable string values to appear in place of the format specifiers in loc-key.
 * @see The <a href='https://developer.apple.com/library/ios/#documentation/NetworkingInternet/Conceptual/RemoteNotificationsPG/ApplePushService/ApplePushService.html#//apple_ref/doc/uid/TP40008194-CH100-SW1'>Payload Documentation</a>
 * @since v1.2.0
 */
Notification.prototype.setLocArgs = function (args) {
  this.prepareAlert();
  if(!args) {
    delete this.alert['loc-args'];
    return;
  }
  this.alert['loc-args'] = args;
}

/**
 * Set the launch-image parameter on the alert object
 * @param {String} [image] The filename of an image file in the application bundle; it may include the extension or omit it.
 * @see The <a href='https://developer.apple.com/library/ios/#documentation/NetworkingInternet/Conceptual/RemoteNotificationsPG/ApplePushService/ApplePushService.html#//apple_ref/doc/uid/TP40008194-CH100-SW1'>Payload Documentation</a>
 * @since v1.2.0
 */
Notification.prototype.setLaunchImage = function (image) {
  this.prepareAlert();
  if(!image) {
    delete this.alert['launch-image'];
    return;
  }
  this.alert['launch-image'] = image;
}

/**
 * If an alert object doesn't already exist create it and transfer any existing message into the .body property
 * @private
 * @since v1.2.0
 */
Notification.prototype.prepareAlert = function () {
  var existingValue = this.alert;
  if (typeof existingValue !== 'object') {
    this.alert = {};
    if (typeof existingValue === 'string') {
      this.alert.body = existingValue;
    }
  }
}

/**
 * Pack notification to buffer
 */
Notification.prototype.pack = function () {
  var v = {}
    , m, l
    , t = this.device && this.device.token
    , buffer
    , p = 0;

  // Validates
  if (!Buffer.isBuffer(t)) return;

  if (this.payload) {
    Object.keys(this.payload).forEach(function (k) {
      v[k] = this.payload[k];
    });
  }

  if (!v.aps) v.aps = {};

  if (this.alert !== undefined)
    v.aps.alert = this.alert;
  if (this.badge !== undefined)
    v.aps.badge = this.badge;
  if (this.sound !== undefined)
    v.aps.sound = this.sound;
  if (this.newsstandAvailable !== undefined)
    v.aps['content-available'] = this.newsstandAvailable;

  m = JSON.stringify(v);
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