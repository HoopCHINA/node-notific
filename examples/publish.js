var http = require('http')
  , util = require('util');

var opts = {
  hostname: '127.0.0.1',
  port: 12320,
  path: '/notific',
  method: 'POST',
};

var token = '01234567 01234567 01234567 01234567';

var req = http.request(opts, function (resp) {
  if (resp.statusCode != 200) {
    util.log('Server Error: ' + resp.statusCode);
    return;
  }

  var chunks = [];

  resp.on('data', function (chunk) {
    chunks.push(chunk);
  });

  resp.on('end', function () {
    util.log('Server Response: ' + Buffer.concat(chunks).toString('utf8'));
  });
});

req.on('error', function (err) {
  util.log('Problem with request: ' + e.message);
});

var data = JSON.stringify({
  ostype: 'ios',
  appid: 'com.hupu.GameMate',
  clients: [token],
  expiry: _now() + 3600,
  payload: {
    aps: {
      alert: 'Hello, world!',
    },
  },
});

// Write data to post body
req.write(data);

req.end();

/* Internal */
function _now() {
  return ~~(Date.now() / 1000);
}
