var rpc = require('msgpack-rpc')
  , apns = require('./apns')
  , mqtt = require('./mqtt');

// UDP redirector need use session validation
// device 需要生成一个 random, 服务端回应 ~random...
// device 需验证

// RPC 接口要有速率控制
var server = rpc.createServer();
var btalk = new beans.client('127.0.0.1', 11300);

var tubes = {};

btalk.connect(function (err) {
  //
});

function split_tasks(ostype, appid, tokens, payload, expiry) {
  var task = {
    ostype: ostype,
    appid: appid,
    tokens: tokens,
    payload: payload,
    expiry: expiry
  };

  return { tube: task, tube2: task };
}

server.setHandler({
  notific: function (ostype, appid, tokens, payload, expiry, _Response) {
    var tasks = split_tasks(ostype, appid, tokens, payload, expiry);

    tasks.keys.forEach(function (tube) {
      btalk.use(tube, function (err) {
        if (err) return;
        btalk.put(0, 0, expiry, tasks[tube]);
      });
    });

    _Response.result('OK');
  },
});

server.listen(8000, '127.0.0.1');

var mqtt_server = require('./mqtt');

// get task
// mqtt_server.publish('');

// task.pause();
// tcp__max_connections();
// ...

/*
  notific(ostype, appid, tokens, payload, expiry);
 */

// RPC 接口要有速率控制
function btalk_handler() {
  // beanstalk_get_task();

  for (var i = 0; i < tesaa.length; i++) {
    tesaa[i];

    var id = get_id();
    var channel = server.get_channel(id);

    // Config channel
    var channel = server.channels[id];

    if (!channel) {
      channel = server.channels[id] = {c: null, q: [], a: []};
    }

    if (channel.c) channel.c.publish(packet);      
    if (packet.retain) {
      (!channel.c ? channel.q : channel.a).push(packet);
    }
  }
}
