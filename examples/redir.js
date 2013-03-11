var dgram = require('dgram')
  , assert = require('assert');

/**
 Query:
   | sequence (int32) | len (int8) | client-id (varchar) |

 Reply:
   | sequence (int32) | address (int32) | port (int16) | ttl (int16) |
*/

var config = {
  mqtt: [
    {address: '127.0.0.1', port: 3080, ttl: 3600},
    {address: '127.0.0.1', port: 3081, ttl: 3600},
    {address: '127.0.0.1', port: 3082, ttl: 3600},
    {address: '127.0.0.1', port: 3083, ttl: 3600},
    {address: '127.0.0.1', port: 3084, ttl: 3600},
    {address: '127.0.0.1', port: 3085, ttl: 3600},
    {address: '127.0.0.1', port: 3086, ttl: 3600},
    {address: '127.0.0.1', port: 3087, ttl: 3600},
  ],
};

var mq = [];

// Pre create reply buffer
assert(config['mqtt'].length, "config['mqtt'] not empty");

config['mqtt'].forEach(function (rec, i) {
  var buf = new Buffer(4+2+2)
    , addr = new Buffer(rec.address.split('.'));

  addr.copy(buf, 0);
  buf.writeUInt16BE(rec.port, 4);
  buf.writeUInt16BE(rec.ttl, 6);

  mq[i] = buf;
});

var server = dgram.createSocket('udp4', function (msg, rinfo) {
  if (msg.length < 6) return;

  var l = msg[4]
    , c = msg.toString('utf8', 5, 5+l)
    , p = mq.length
    , h = parseInt(c.slice(-2), 16)
    , i = ((h >> 4) * 13 + (h & 0xf)) % p
    , buf = new Buffer(4+4+2+2);

  msg.copy(buf, 0, 0, 4);
  mq[i].copy(buf, 4);

  server.send(buf, 0, buf.length
  	        , rinfo.port, rinfo.address);
});

server.bind(12121, '127.0.0.1');
