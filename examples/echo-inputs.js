'use strict';

module.exports.handler = function handler (event, context, callback) {
  callback(null, { event, context });
};
