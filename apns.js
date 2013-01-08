var apns = require('apn')
  , beans = require('fivebeans'),
  , config = require('./config.json');

function BeansWorker() {
  var cli = new beans.client('10.0.1.1', 11300);

  cli.connect(function (err) {
    if (err !== null) {
      process.nextTick(BeansWorker);
    } else {
      DoJobs(cli);
    }
  });
}

function DoJobs(cli) {
  cli.use('apns', function (err, tube) {
    cli.reserve();
  });
}

/*
  notific(appid, tokens, payload, expiry);
 */

var connections = {};

exports.notific = function (appid, tokens, payload, expiry) {
  var c = connections[appid];

  if (!c) {
    var options = {
      cert: config[appid].cert,
      certData: null,
      key:  config[appid].key,
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
    try {
      var device = new apns.Device(token);
      var note = new apns.Notification();

      note.device = device;
      note.expiry = expiry;

      if (payload.badge !== undefined) note.badge = payload.badge;
      if (payload.sound !== undefined && payload.sound !== '') note.sound = payload.sound;

      note.alert = payload.title + ', ' + payload.content;
      note.payload = { 'url': payload.url };

      c.sendNotification(note);
    } catch (err) {
      console.error('NotificIOS Error:', token, '-', err);
    }
  });
}
