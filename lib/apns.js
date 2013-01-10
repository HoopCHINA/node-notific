var apns = require('apn');

/*
  notific(appid, tokens, payload, expiry);
 */

var connections = {};

exports.notific = function (app, tokens, payload, expiry) {
  var c = connections[app];

  if (!c) {
    var options = {
      cert: config[app].cert,
      certData: null,
      key:  config[app].key,
      keyData: null,
      passphrase: null,
      ca: null,
      gateway: 'gateway.push.apple.com',
      port: 2195,
      enhanced: true,
      errorCallback: function (err, data) { console.error('NotificIOS Send Error:', err, data); },
      cacheLength: 8000,
      connectionTimeout: 300 * 1000
    };

  	c = connections[app] = new apns.Connection(options);
  }

  tokens.forEach(function (token) {
    var note = new apns.Notification();

    note.device = new apns.Device(token);
    note.expiry = expiry;

    if (payload.badge !== undefined) note.badge = payload.badge;
    if (payload.sound !== undefined && payload.sound !== '') note.sound = payload.sound;

    note.alert = payload.title + ', ' + payload.content;
    note.payload = { 'url': payload.url };

    c.sendNotification(note);
  });
};
