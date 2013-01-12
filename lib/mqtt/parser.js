/* Parse - packet parsing */
var events = require('events')
  , util = require('util')
  , protocol = require('./protocol');

function Parser() {
  events.EventEmitter.call(this);

  this.buffer = null;
  this.written = this.read = 0;
};
util.inherits(Connection, events.EventEmitter);
exports.Parser = Parser;

Parser.prototype.parse = function(buf) {
  // Do we have sufficient space in the buffer for the incoming data?
  
  if (this.read === this.written) {
    this.buffer = buf;
  } else if (this.written + buf.length > this.buffer.length) {
    var newBuffer = new Buffer( this.written + buf.length );
    this.buffer.copy(newBuffer);
    this.buffer = newBuffer;
  }
  
  // Copy incoming data into the internal buffer
  buf.copy(this.buffer, this.written);
  this.written += buf.length;

  var pos = this.read, len = this.written;
  while (pos < len) {
    // Fresh packet - parse the header
    if (!packet.cmd) {
      parse['header'](this.buffer[pos], packet);
      pos++;
    }
    // Parse the remaining length field
    if (!this.packet.length) {
      var tmp = {mul: 1, length: 0};
      var start_pos = pos;
      do {
        if (pos >= len) {
          pos = start_pos; // reading length is atomic, either we read all of it or none of it
          break;
        }
        tmp.length += tmp.mul * (this.buffer[pos] & protocol.LENGTH_MASK);
        tmp.mul *= 0x80;
      } while ((this.buffer[pos++] & protocol.LENGTH_FIN_MASK) !== 0);
      if (pos > start_pos) {
        this.packet.length = tmp.length;
      } else {
        tmp = start_pos = null;
        break;
      }
    }
    // Do we have enough data to complete the payload?
    if (len - pos < this.packet.length) {
      // Nope, wait for more data 
      break;
    } else {
      // We've either got enough for >= 1 packet
      parse[this.packet.cmd](
      this.buffer.slice(pos, this.packet.length + pos), this.packet);
      // Indicate that we've read all the data
      pos += this.packet.length;
      // Emit packet and reset connection state
      this.emit(this.packet.cmd, this.packet);
      this.packet = {};
    }
  }
  
  if (this.read !== pos) {
    // Discard the old data in the buffer to free up the RAM
    var tmpBuf = new Buffer( this.buffer.written - this.buffer.read );
    this.buffer.copy( tmpBuf, 0, this.buffer.read, this.buffer.written );
    this.buffer = tmpBuf;
    this.buffer.read = 0;
    this.buffer.written = tmpBuf.length;
    
    // Processed all the data in the buffer and read length (this is needed since as assume length always starts at the buf[1], reset pointers
    if (this.buffer.written === this.buffer.read && this.packet.length) {
      this.buffer.written = this.buffer.read = 0;
    }
  }
};

exports.header = function(header, packet) {
  packet.cmd = protocol.types[header >> protocol.CMD_SHIFT];
  packet.retain = (header & protocol.RETAIN_MASK) !== 0;
  packet.qos = (header >> protocol.QOS_SHIFT) & protocol.QOS_MASK;
  packet.dup = (header & protocol.DUP_MASK) !== 0;
  return packet;
};

exports.connect = function(buf, packet) {
  var pos = 0
    , len = buf.length
    , version_and_len
    , topic_and_len
    , username_and_len
    , client_and_len
    , payload_and_len
    , password_and_len
    , flags = {};
  
  /* Parse version string */
  version_and_len = parse_string(buf, len, pos);
  if (version_and_len === null) return null;
  packet.version = version_and_len[0];
  if (packet.version === null) return null;
  pos += version_and_len[1] + 2;

  /* Parse version number */
  if (pos >= len) return null;
  packet.versionNum = buf[pos];
  pos += 1;

  /* Parse connect flags */
  if (pos >= len) return null;
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
  packet.keepalive = parse_num(buf, len, pos);
  if (packet.keepalive === null) return null;
  pos += 2;
  
  /* Parse client ID */
  client_and_len = parse_string(buf, len, pos);
  if (client_and_len === null) return null;
  packet.client = client_and_len[0];
  if (packet.client === null) return null;
  pos += client_and_len[1] + 2;

  if (flags.will) {
    /* Parse will topic */
    topic_and_len = parse_string(buf, len, pos);
    if (topic_and_len === null) return null;
    packet.will.topic = topic_and_len[0];
    if(packet.will.topic === null) return null;
    pos += topic_and_len[1] + 2;

    /* Parse will payload */
    payload_and_len = parse_string(buf, len, pos);
    if (payload_and_len === null) return null;
    packet.will.payload = payload_and_len[0];
    if(packet.will.payload === null) return null;
    pos += payload_and_len[1] + 2;
  }
  
  /* Parse username */
  if(flags.username) {
    username_and_len = parse_string(buf, len, pos);
    if (username_and_len === null) return null;
    packet.username = username_and_len[0];
    if(packet.username === null) return null;
    pos += username_and_len[1] + 2;
  }
  
  /* Parse password */
  if(flags.password) {
    password_and_len = parse_string(buf, len, pos);
    if (password_and_len === null) return null;
    packet.password = password_and_len[0];
    if(packet.password === null) return null;
    pos += password_and_len[1] + 2;
  }
  
  return packet;
};

exports.puback = function(buf, packet) {
  packet.messageId = parse_num(buf, buf.length, 0);
  return (packet.messageId !== null) ? packet : null;
};

exports.pingreq = function(buf, packet) { return packet; };

exports.disconnect = function(buf, packet) { return packet; };

// Privates
function parse_num(buf, len, pos) {
  if (len - pos < 2) return null;
  return buf.readUInt16BE(pos);
}

function parse_string(buf, len, pos) {
  var length = parse_num(buf, len, pos);
  if (length === null || len - pos - 2 < length) return null;
  return [buf.toString('utf8', pos + 2, pos + length + 2), length];
}
