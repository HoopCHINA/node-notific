var mqtt_server = require('./mqtt');

// get task
// mqtt_server.publish('');

// task.pause();
// tcp__max_connections();
// ...


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
