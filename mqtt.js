var mqtt = require('mqttjs');

// TODO: fix MQTT.js connect() of parse.js, the null return of parse_string() bug...

function MQTTNotificServer(opts) {
	this.opts = {
		defaultVersion: 'MQIsdp',
		defaultVersionNum: 3,
		defaultKeepalive : 60,
		maxConnections: 3000,
	};

	this.opts = util.merge(this.opts, opts);

	var server = this.server = mqtt.createServer(_handler);
	
	server.maxConnections = this.opts.maxConnections;
	server.channels = {};

	function _isValidId(id) {
		// id.length < 1 || id.length > 23 return false;
	}

	function _handler(client) {
		function _destroy() { client.stream.destroy(); }
		function _destroySoon() { client.stream.destroySoon(); }

		client.stream.setNoDelay();
		client.stream.setTimeout(DEFAULT_KEEPALIVE, _destroySoon);

		client.on('connect', function (packet) {
			// Check version and client id
			if (packet.version != DEFAULT_VERSION || packet.versionNum < DEFAULT_VERSION_NUM) {
				this.connack({ returnCode: 1 }); _destroySoon(); return;
			} else if (!_isValidId(packet.client)) {
				this.connack({ returnCode: 2 }); _destroySoon(); return;
			}

			this.id = packet.client;
			this.clean = packet.clean;
			this.keepalive = packet.keepalive;
			this.stream.setTimeout(this.keepalive);

			// Config channel
			var channel = server.channels[this.id];

			if (!channel)
				channel = server.channels[this.id] = {c: this, q: [], a: []};
			else if (channel.c) {
				channel.c.stream.destroy();
				channel.c = this;
			}

			if (this.clean) {
				// Clean session
				channel.q.length = channel.a.length = 0;
			} else {
				// Publish retained packets
				var self = this;

				channel.q.forEach(function (packet) {
					self.publish(packet);
				});
				channel.a.forEach(function (packet) {
					packet.dup = true;
					self.publish(packet);
				});
				// Concat pubq to ackq
				channel.a = channel.a.concat(channel.q);
				channel.q.length = 0;
			}
		});

		client.on('puback', function (packet) {
			if (!this.id) { _destroy(); return; }

			var channel = server.channels[this.id];
			if (!channel) return;

			var a = channel.a;

			for (var i = 0, j = a.length; i < j; i++) {
				if (a[i].messageId === packet.messageId) {
					delete a[i];
					break;
				}
			}
		});

		client.on('pingreq', function(packet) {
			this.pingresp();
		});

		client.on('disconnect', _destroySoon);

		client.on('error', function (err) {
			util.log('error! - ' + err);
		});

		client.on('close', function () {
			if (!this.id) return;

			var channel = server.channels[this.id];

			if (channel && channel.c === this) {
				channel.c = null;
			}
		});

		var evs = ['connack', 'publish', 'pubrec', 'pubrel', 'pubcomp',
				   'subscribe', 'suback', 'unsubscribe', 'unsuback',
				   'pingresp', 'reserved'];

		evs.forEach(function (ev) {
			client.on(ev, _destroy);
		});
	}
}

MQTTNotificServer.prototype.listen = function (port, address) {
	this.server.listen(port, address);
};

// per minute
function _gc() {
	// clean expired packets;
	// clean empty channel;
	if (!channel.c && !channel.q.length && !channel.a.length) {
		delete channels[id];
	}
	// generate feedback task;
}

// RPC 接口要有速率控制
function btalk_handler() {
	// beanstalk_get_task();

	for (var i = 0; i < tesaa.length; i++) {
		tesaa[i];

		var id = get_id();
		var channel = server.get_channel(id);

		if (!channel.c) {
			if (packet.retain)
				channel.q.push(packet);
		} else {
			channel.c.publish(packet);
			if (packet.retain)
				channel.a.push(packet);
		}
	}
}
