var dgram = require('dgram')
  , assert = require('assert');

/**
 Query:
   | sequence (int32) | len (int8) | client-id (varchar) |

 Reply:
   | sequence (int32) | address (int32) | port (int16) | ttl (int16) |
*/

var config = {
  redir: {
    address: '127.0.0.1',
    port: 12121,
  },
};

var client = dgram.createSocket('udp4')
  , timer = setInterval(query, 10*1000)
  , id = process.argv[2] || 'deadcafe'
  , buf = new Buffer(4+1+Buffer.byteLength(id));

buf.writeUInt32BE(~~(Date.now()/1000), 0);
buf.writeUInt8(id.length, 4);
buf.write(id, 5);

query();

function query() {
  client.send(buf, 0, buf.length
            , config['redir'].port, config['redir'].address);
}

client.on('message', function (msg, rinfo) {
  assert(msg.length == 12, 'msg.length == 12');
  client.close();
  clearInterval(timer);

  var seq = msg.readUInt32BE(0)
    , addr = Array.prototype.join.call(msg.slice(4, 8), '.')
    , port = msg.readUInt16BE(8)
    , ttl = msg.readUInt16BE(10);

  console.log('Reply from:', rinfo.address
            , '{', seq, addr, port, ttl, '}');
});
