/* Copyright (c) 2011 Adam Rudd. See LICENSE for more information */
/* Copyright (c) 2013 Wang Wenlin. See LICENSE for more information */

/* Parse - packet parsing */

var events = require('events')
  , util = require('util')
  , protocol = require('./protocol')
  , parse = {};

function Parser(socket) {
  events.EventEmitter.call(this);

  this.buffer = null;
  this.read = 0;
  this.packet = {};

  /* Filter income data */
  socket.on('data', this._parse.bind(this));
};
util.inherits(Parser, events.EventEmitter);
exports.Parser = Parser;

Parser.prototype._parse = function (buf) {
  /* Concat buffer */
  if (!this.buffer) {
    this.buffer = buf;
  } else {
    var newBuf = new Buffer(this.buffer.length - this.read + buf.length);
    this.buffer.copy(newBuf, 0, this.read);
    buf.copy(newBuf, this.buffer.length - this.read);
    this.buffer = newBuf;
  }

  /* Parse */
  var len = this.buffer.length
    , read = 0
    , pos = 0;

  while (pos < len) {
    /* Fresh packet - parse the header */
    if (this.packet.cmd === undefined) {
      /* Assert: (pos < len) */
      pos = parse['header'](this.buffer, pos, this.packet);
      /* Always success */
      read = pos;
    }

    /* Parse the remaining length field */
    if (this.packet.length === undefined) {
      if (pos + 1 > len) break;
      pos = parse['length'](this.buffer, pos, this.packet);
      if (pos === null || pos === -1) break;
      read = pos;
    }

    /* Do we have enough data to complete the payload? */
    if (pos + this.packet.length > len) break;
    /* We've either got enough for >= 1 packet */
    if (parse[this.packet.cmd]) {
      pos = parse[this.packet.cmd](this.buffer, pos, this.packet);
      if (pos === null) break;
      this.emit(this.packet.cmd, this.packet);
    } else {
      pos += this.packet.length;
      this.emit('notimpl', this.packet);
    }

    /* Move-on and cleanup */
    read = pos;
    this.packet = {};
  }

  if (pos === null) {
    this.emit('error', new Error('Invalid packet'));
  }

  if (pos === null || read === this.buffer.length) {
    this.buffer = null;
    this.read = 0;
  } else {
    this.read = read;
  }
};

/* Header */
parse.header = function (buf, pos, packet) {
  var o = buf[pos++];
  packet.cmd = protocol.types[o >> protocol.CMD_SHIFT];
  packet.retain = (o & protocol.RETAIN_MASK) !== 0;
  packet.qos = (o >> protocol.QOS_SHIFT) & protocol.QOS_MASK;
  packet.dup = (o & protocol.DUP_MASK) !== 0;
  return pos;
};

/* Remaining length */
parse.length = function (buf, pos, packet) {
  var MASK = protocol.LENGTH_MASK
    , FIN = protocol.LENGTH_FIN_MASK
    , o = buf[pos++];

  if (~o & FIN) {
    packet.length = (o & MASK);
    return pos;
  }

  /* Remaining (<= 3 bytes) */
  var e = (buf.length - pos) < 3 ? buf.length : pos + 3
    , e_ = pos + 3
    , m = 0x80
    , l = (o & MASK);

  for (; pos < e; m *= 0x80) {
    o = buf[pos++];
    l += m * (o & MASK);
 
    if (~o & FIN) {
      packet.length = l;
      return pos;
    }
  }

  return pos < e_ ? -1 : null;
};

/* Connect */
parse.connect = function (buf, pos, packet) {
  var end = pos + packet.length
    , version_and_len
    , topic_and_len
    , username_and_len
    , client_and_len
    , payload_and_len
    , password_and_len
    , flags = {};

  /* Parse version string */
  version_and_len = parse_string(buf, pos);
  if (version_and_len === null) return null;
  packet.version = version_and_len[0];
  if (packet.version === null) return null;
  pos += version_and_len[1] + 2;

  /* Parse version number */
  if (pos >= end) return null;
  packet.versionNum = buf[pos];
  pos += 1;

  /* Parse connect flags */
  if (pos >= end) return null;
  flags.username = (buf[pos] & protocol.USERNAME_MASK);
  flags.password = (buf[pos] & protocol.PASSWORD_MASK);
  flags.will = (buf[pos] & protocol.WILL_FLAG_MASK);

  if (flags.will) {
    packet.will = {};
    packet.will.retain = (buf[pos] & protocol.WILL_RETAIN_MASK) !== 0;
    packet.will.qos = (buf[pos] & protocol.WILL_QOS_MASK) >> protocol.WILL_QOS_SHIFT;
  }

  packet.clean = (buf[pos] & protocol.CLEAN_SESSION_MASK) !== 0;
  pos += 1;

  /* Parse keepalive */
  packet.keepalive = parse_num(buf, pos);
  if (packet.keepalive === null) return null;
  pos += 2;

  /* Parse client ID */
  client_and_len = parse_string(buf, pos);
  if (client_and_len === null) return null;
  packet.client = client_and_len[0];
  if (packet.client === null) return null;
  pos += client_and_len[1] + 2;

  if (flags.will) {
    /* Parse will topic */
    topic_and_len = parse_string(buf, pos);
    if (topic_and_len === null) return null;
    packet.will.topic = topic_and_len[0];
    if(packet.will.topic === null) return null;
    pos += topic_and_len[1] + 2;

    /* Parse will payload */
    payload_and_len = parse_string(buf, pos);
    if (payload_and_len === null) return null;
    packet.will.payload = payload_and_len[0];
    if(packet.will.payload === null) return null;
    pos += payload_and_len[1] + 2;
  }

  /* Parse username */
  if (flags.username) {
    username_and_len = parse_string(buf, pos);
    if (username_and_len === null) return null;
    packet.username = username_and_len[0];
    if(packet.username === null) return null;
    pos += username_and_len[1] + 2;
  }

  /* Parse password */
  if (flags.password) {
    password_and_len = parse_string(buf, pos);
    if (password_and_len === null) return null;
    packet.password = password_and_len[0];
    if(packet.password === null) return null;
    pos += password_and_len[1] + 2;
  }

  return end;
};

/* Puback */
parse.puback = function (buf, pos, packet) {
  packet.messageId = parse_num(buf, pos);
  return (packet.messageId !== null) ? (pos + packet.length) : null;
};

/* Pingreq, disconnect, reserved */
(function () {
  var empties = ['pingreq', 'disconnect', 'reserved'];

  empties.forEach(function (f) {
    parse[f] = function (buf, pos, packet) {
      return (pos + packet.length);
    };
  });
})();

/* Privates */
function parse_num(buf, pos) {
  if (buf.length - pos < 2) return null;
  return buf.readUInt16BE(pos);
}

function parse_string(buf, pos) {
  var l = parse_num(buf, pos);
  if (l === null || (buf.length - pos - 2) < l) return null;
  return [buf.toString('utf8', pos + 2, pos + l + 2), l];
}
