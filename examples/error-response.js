'use strict';

module.exports.handler = function handler (event, context, callback) {
  callback(new Error('something went wrong'), 'this should not be seen');
};
