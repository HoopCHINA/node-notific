var fs = require('fs'),
    tls = require('tls')，
    stdout = process.stdout;

var CERTFILE = 'cert/apns-product-cert.pem',
    KEYFILE = 'cert/apns-product-key-noenc.pem',
    GATEWAY = 'gateway.push.apple.com',
    PORT = 2195;

var TIMEOUT = 60 * 1000;

var certData, keyData;

var readBuffer = new Buffer(0);

var feeds = [];

fs.readFile(CERTFILE, function (err, data) {
  if (err) return;
  certData = data.toString();
  connect();
});

fs.readFile(KEYFILE, function (err, data) {
  if (err) return;
  keyData = data.toString();
  connect();
});

function connect() {
  if (!certData || !keyData) return;

  var opt = {
    cert: certData,
    key: keyData,
  };

  var socket = tls.connect(PORT, GATEWAY, opt, function () {
    socket.on('data', receive);
    socket.on('end', flush);
    socket.setTimeout(TIMEOUT, function () { socket.destroy(); });
  });
}

function receive(data) {
  var time = 0,
      tokenLength = 0,
      token = null;

  var newBuffer = new Buffer(readBuffer.length + data.length);
  readBuffer.copy(newBuffer);
  data.copy(newBuffer, readBuffer.length);
  readBuffer = newBuffer;

  while (readBuffer.length > 6) {
    time = readBuffer.readUInt32BE(0);
    tokenLength = readBuffer.readUInt16BE(4);

    if ((readBuffer.length - 6) < tokenLength) {
    	return;
    }

    token = new Buffer(tokenLength);
    readBuffer.copy(token, 0, 6, 6 + tokenLength);
    readBuffer = this.readBuffer.slice(6 + tokenLength);

    feedback(time, token.toString('hex'));
  }
}

function feedback(time, token) {
  feeds.push(time + ': ' + token);
}

function flush() {
  stdout.write(feeds.join('\n'));
}
