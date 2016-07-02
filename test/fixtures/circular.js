'use strict';

module.exports.handler = function handler (event, context, callback) {
  const obj = { foo: 'bar' };

  obj.baz = obj;
  callback(null, obj);
};
