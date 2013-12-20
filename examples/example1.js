/* Copyright (c) 2013 Wang Wenlin. See LICENSE for more information */

var restify = require('restify')
  , apns = require('..').apns
  , mqtt = require('..').mqtt;

var conf = {
  rest: {
    port: 3000,
    host: '127.0.0.1',
  },
  mqtt: {
    port: 3080,
    host: '127.0.0.1',
  },
  apns: {
    'com.foo.bar': {
      keyfile: 'certs/key.pem',
      certfile: 'certs/cert.pem',
      push: {
        keepalive: 300,
        maxcache: 750,
      },
      feedback: {
        keepalive: 60,
      },
    },
  },
};

var restServer = restify.createServer({name: 'node-notific'})
  , apnsAgent = apns.createAgent(conf.apns)
  , apnsFeedback = apns.createFeedback(conf.apns)
  , mqttServer = mqtt.createServer();

var feedStore = {
  ios: {exp: {}, inv: {}},
  droid: {exp: {}},
};

/* APNS */
apnsAgent.on('invtoken', function (app, tok) {
  var invs = feedStore.ios.inv
    , inv = invs[app] || (invs[app] = {});
  inv[tok] = _now();
});

apnsFeedback.on('feedback', function (app, feeds) {
  var exps = feedStore.ios.exp
    , exp = exps[app] || (exps[app] = {});
  Object.keys(feeds).forEach(function (k) {
    exp[k] = feeds[k];
  });
});

/* MQTT */
mqttServer.on('feedback', function (app, feeds) {
  var exps = feedStore.droid.exp
    , exp = exps[app] || (exps[app] = {});
  Object.keys(feeds).forEach(function (k) {
    exp[k] = feeds[k];
  });
});

/* RESTful Interface */
restServer.pre(restify.pre.sanitizePath());
restServer.use(restify.acceptParser(restServer.acceptable));
restServer.use(restify.bodyParser({ mapParams: false }));

restServer.post('/ios/notific/:app', function (req, resp, next) {
  var app = req.params.app
    , work = req.body || {};
  try {
    apnsAgent.notific(app, work.tokens, work.payload, work.expiry);
    resp.send('+OK');
  } catch (e) {
    console.warn('Work error! - %s', e.message);
    resp.send(422, e);
  }
});

restServer.get('/ios/invtoken/:app', function (req, resp, next) {
  var app = req.params.app
    , invs = feedStore.ios.inv;
  _sendFeeds(invs, app, resp);
});

restServer.get('/ios/feedback/:app', function (req, resp, next) {
  var app = req.params.app
    , exps = feedStore.ios.exp;
  _sendFeeds(exps, app, resp);
});

restServer.post('/droid/notific/:app', function (req, resp, next) {
  var app = req.params.app
    , work = req.body || {};
  try {
    mqttServer.notific(app, work.clients, work.payload, work.expiry);
    resp.send('+OK');
  } catch (e) {
    console.warn('Work error! - %s', e.message);
    resp.send(422, e);
  }
});

restServer.get('/droid/feedback/:app', function (req, resp, next) {
  var app = req.params.app
    , exps = feedStore.droid.exp;
  _sendFeeds(exps, app, resp);
});

function _sendFeeds(store, app, resp) {
  if (store[app]) {
    resp.send(store[app]);
    delete store[app];
  } else {
    resp.send([]);
  }
}

/* Listen */
mqttServer.listen(conf.mqtt.port, conf.mqtt.host);

restServer.listen(conf.rest.port, conf.rest.host, function () {
  console.log('%s listening at %s', restServer.name, restServer.url);
});

// TODO move in apns.js
(function () {
  var apps = Object.keys(conf.apns);
  if (!apps.length) return;

  setInterval(function () {
    var app = apps.shift();
    apps.push(app);
    apnsFeedback.feedback(app);
  }, ~~(30*60 / apps.length) * 1000);
})();

/* Internal */
function _now() {
  return Math.floor(Date.now() / 1000);
}
