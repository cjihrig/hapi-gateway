'use strict';

const Utils = require('./utils');


module.exports.invoke = function invoke (settings, payload, callback) {
  try {
    const deploy = settings.deploy;
    const handler = require(deploy.source)[deploy.export];
    const event = Utils.tryParse(payload);
    const context = {}; // Currently intentionally left empty

    handler(event, context, function handlerCb (err, data) {
      if (err) {
        return callback(null, formatErrorAsLambdaResponse(err));
      }

      callback(null, createLambdaResponse(data));
    });
  } catch (err) {
    return callback(new Error('cannot invoke function locally'));
  }
};


function createLambdaResponse (data) {
  try {
    return {
      StatusCode: 200,
      Payload: JSON.stringify(data)
    };
  } catch (err) {
    return formatErrorAsLambdaResponse(err);
  }
}


function formatErrorAsLambdaResponse (err) {
  return {
    StatusCode: 200,
    FunctionError: 'Handled',
    Payload: JSON.stringify({
      errorMessage: err.message,
      errorType: err.constructor.name,
      stackTrace: []  // Currently intentionally left empty
    })
  };
}
