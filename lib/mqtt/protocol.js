/* Protocol - protocol constants */

/* Command code => mnemonic */
exports.types = [
  /* 0*/ 'reserved',
  /* 1*/ 'connect',
  /* 2*/ 'reserved',
  /* 3*/ 'reserved',
  /* 4*/ 'puback',
  /* 5*/ 'reserved',
  /* 6*/ 'reserved',
  /* 7*/ 'reserved',
  /* 8*/ 'reserved',
  /* 9*/ 'reserved',
  /*10*/ 'reserved',
  /*11*/ 'reserved',
  /*12*/ 'pingreq',
  /*13*/ 'reserved',
  /*14*/ 'disconnect',
  /*15*/ 'reserved',
];

/* Mnemonic => Command code */
exports.codes = {
  'reserved': 0,
  'connack': 2,
  'publish': 3,
  'pingresp': 13,
};

/* Header */
exports.CMD_SHIFT = 4;
exports.CMD_MASK = 0xF0;
exports.DUP_MASK = 0x08;
exports.QOS_MASK = 0x03;
exports.QOS_SHIFT = 1;
exports.RETAIN_MASK = 0x01;

/* Length */
exports.LENGTH_MASK = 0x7F;
exports.LENGTH_FIN_MASK = 0x80;

/* Connect */
exports.USERNAME_MASK = 0x80;
exports.PASSWORD_MASK = 0x40;
exports.WILL_RETAIN_MASK = 0x20;
exports.WILL_QOS_MASK = 0x18;
exports.WILL_QOS_SHIFT = 3;
exports.WILL_FLAG_MASK = 0x04;
exports.CLEAN_SESSION_MASK = 0x02;
