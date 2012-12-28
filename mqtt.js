var mqtt = require('mqttjs');

struct ack_t {
	string topic;
	vector pks;
};

function mqtt_server(opts) {
	this.opts = {

	};

	this.opts = util.merge(this.opts, opts);

	this.topics = {};
	this.topics[topic] = {
		c: connection,
		q: [],
	};
}

mqtt_server.prototype.listen = function (port, binding) {

};

mqtt_server.prototype.publish = function (notific) {
	this.buffer.push(notific);
	//
	if (client) {
		client.publish({ payload: notific });
	} else {
		topic.push(notific);
	}
};

on_connect(function (client) {
	// 仅保持一个连接
	if (is_connect) {
		client.end();
	}
	while (has_element()) {
		client.write(req);
		ack_queue.push(req);
	}
	client.setTimeout(MQTT_KEEPALIVE);
});

on_disconnect(function (client) {
	move_nonack_pkts_to_queue;
});

mqtt.createServer(funciton (client) {
	var self = this;

	self

}).listen(1883, '127.0.0.1');



var server = mqtt.createServer(onConnect);

server.maxConnections = MAX_CONN;

server.clients = {};
server.topics = {};

server.listen(1883);

function onConnect(client) {
	client.stream.setNoDelay();

	client.stream.setTimeout(DEF_CONN_TIMEOUT, function () {
		this.destroySoon();
	});

	client.on('connect', function (packet) {
		if (packet.versionNum != 3) {
			this.connack({returnCode: 1});
			this.stream.destrySoon();
			return;
		} else if (!isValid(packet.client)) {
			this.connack({returnCode: 2});
			this.stream.destrySoon();
			return;
		}

		this.id = packet.client;

		this.stream.setTimeout(packet.keepalive);

		if (this.clean) {
			// clean session
		} else {
			// Publish retain packet
		}
	});

	client.on('puback', function (packet) {
		if (!this.id) return;
	});
}


var server = mqtt.createServer(function (client) {
  var self = this;

  if (!self.clients) self.clients = {};
  if (!self.topics) self.topics = {};

  client.stream.setNoDelay();

  client.on('connect', function(packet) {
    client.connack({returnCode: 0});

    client.id = packet.client;

    client.stream.setTimeout(packet.keepalive, function () {
    	this.destroySoon();
    });

    self.clients[client.id] = client;
  });

  client.on('puback', function(packet) {
  	delete self.topics[client.session];
  });

  client.on('subscribe', function(packet) {
    var granted = [];
    for (var i = 0; i < packet.subscriptions.length; i++) {
      granted.push(packet.subscriptions[i].qos);
    }

    client.suback({granted: granted});
  });

  client.on('pingreq', function(packet) {
    client.pingresp();
  });

  client.on('disconnect', function(packet) {
    client.stream.destroySoon();
  });

  client.on('close', function(err) {
    delete self.clients[client.id];
  });

  client.on('error', function(err) {
    client.stream.destroy();
    util.log('error!');
  });
}).listen(1883);