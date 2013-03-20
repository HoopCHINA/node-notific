/* Copyright (c) 2013 Wang Wenlin. See LICENSE for more information */

var restify = require('restify')
  , assert = require('assert');

var endUrl = 'http://127.0.0.1:12320'
  , client = restify.createJsonClient({url: endUrl})
  , token = '01234567 01234567 01234567 01234567';

var data = {
  tokens: [],
  expiry: _now() + 3600,
  payload: {
    aps: {
      alert: 'Hello, world!',
    },
    url: 'app://HOME',
  },
};

var opts = {
  path: '/ios/notific/com.hupu.GameMate',
  headers: {'Connection': 'close'},
};

for (var i = 0; i < 999; i++) {
  data.tokens.push(token);
}

client.post(opts, data, function (err, req, res, obj) {
  assert.ifError(err);
  console.log('%d -> %j', res.statusCode, res.headers);
  console.log('%j', obj);
});

/* Internal */
function _now() {
  return Math.floor(Date.now() / 1000);
}
