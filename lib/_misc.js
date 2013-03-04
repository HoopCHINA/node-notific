// Miscs

exports.noop = function () {};

exports.now = function () {
  return Math.floor(Date.now() / 1000);
};

exports.randid = function (scale) {
  return Math.floor(Math.random() * scale);
};
