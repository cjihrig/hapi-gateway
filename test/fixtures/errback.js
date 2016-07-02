'use strict';

module.exports.handler = function handler (event, context, callback) {
  callback(new Error('problem'), 'this should not be seen');
};
