/* Copyright (c) 2011 Adam Rudd. See LICENSE for more information */
/* Copyright (c) 2013 Wang Wenlin. See LICENSE for more information */

var protocol = require('./protocol');

/* Generate */
function generate(cmd, opts) {
  if (!generate[cmd]) return null;
  return generate[cmd](opts);
}
module.exports = generate;

/* Connack */
generate.connack = function (opts) {
  var opts = opts || {}
    , rc = opts.returnCode || 0
    , packet;

  /* Check required fields */
  if (typeof rc !== 'number' || (rc < 0) || (rc > 5)) return null;

  /* Generate packet */
  packet = new Buffer(4);
  packet[0] = protocol.codes['connack'] << protocol.CMD_SHIFT;
  packet[1] = 2;
  packet[2] = 0;
  packet[3] = rc;

  return packet;
};

/* Publish */
generate.publish = function (opts) {
  var opts = opts || {}
    , dup = opts.dup ? protocol.DUP_MASK : 0
    , qos = opts.qos || 0
    , retain = opts.retain ? protocol.RETAIN_MASK : 0
    , topic = opts.topic
    , payload = opts.payload || ''
    , id = opts.messageId || randid()
    , packet;

  /* Check required fields */
  if (typeof topic !== 'string' || !topic) return null;
  if (typeof qos !== 'number' || qos < 0 || qos > 2) return null;
  if (typeof id !== 'number' || id < 0 || id > 0xFFFF) return null;

  if (!Buffer.isBuffer(payload) && typeof payload !== 'string') {
    payload = JSON.stringify(payload);
  }

  /* Length of fields */
  var tlen = Buffer.byteLength(topic)
    , plen = !Buffer.isBuffer(payload) ? Buffer.byteLength(payload) : payload.length
    , rlen = 2 + tlen + (qos > 0 ? 2 : 0) + plen
    , llen = rlenlen(rlen)
    , pos = 0;

  /* Check valid */
  if (llen < 0) return null;

  /* Generate packet */
  packet = new Buffer(1 + llen + rlen);

  /* Header */
  packet[pos] = protocol.codes['publish'] << protocol.CMD_SHIFT |
    dup | qos << protocol.QOS_SHIFT | retain;
  pos += 1;

  /* Length */
  rlengen(rlen, packet, pos);
  pos += llen;

  /* Topic */
  packet.writeUInt16BE(tlen, pos);
  packet.write(topic, pos + 2);
  pos += 2 + tlen;

  /* Message Id */
  if (qos > 0) {
    packet.writeUInt16BE(id, pos);
    pos += 2;
  }

  /* Payload */
  if (Buffer.isBuffer(payload)) {
    payload.copy(packet, pos);
  } else {
    packet.write(payload, pos);
  }

  return packet;
};

/* Pingresp */
generate.pingresp = function () {
  /* Lazy-eval pattern */
  generate.pingresp = function () {
    return packet;
  };

  /* Generate packet */
  var packet = new Buffer(2);
  packet[0] = protocol.codes['pingresp'] << protocol.CMD_SHIFT;
  packet[1] = 0;

  return packet;
};

/* Privates */
function rlenlen(len) {
  if (len <= 127) return 1;
  if (len <= 16383) return 2;
  if (len <= 2097151) return 3;
  if (len <= 268435455) return 4;
  return -1;
}

function rlengen(len, buf, pos) {
  var digit;

  do {
    digit = len % 128 | 0;
    len = len / 128 | 0;
    if (len > 0) {
        digit = digit | 0x80;
    }
    buf[pos++] = digit;
  } while (len > 0);

  return pos;
}

function randid() {
  return ~~(Math.random() * 0xffff) + 1; // V3.1-p2.4: 0 is reserved mid
}
