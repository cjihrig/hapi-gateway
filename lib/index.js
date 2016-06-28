'use strict';

const Aws = require('aws-sdk');
const Bundler = require('lambundaler');
const Insync = require('insync');
const Joi = require('joi');
const Merge = require('lodash.merge');

const settingsSymbol = Symbol('settings');

const schema = Joi.object({
  name: Joi.string().required().description('name of lambda to invoke'),
  setup: Joi.func().required().arity(2).description('custom setup function'),
  complete: Joi.func().required().arity(4).description('custom complete function'),
  config: Joi.object().optional().default({}).description('general AWS config'),
  role: Joi.string().required().description('AWS role with execute permissions'),
  deploy: Joi.object().keys({
    source: Joi.string().required().description('path to lambda source code'),
    export: Joi.string().required().description('export used as lambda handler')
  }).optional().description('code to deploy to AWS')
});

const defaults = {
  setup (request, callback) {
    callback(null, JSON.stringify({
      app: request.app,
      auth: request.auth,
      headers: request.headers,
      id: request.id,
      info: request.info,
      method: request.method,
      mime: request.mime,
      params: request.params,
      path: request.path,
      payload: request.payload,
      query: request.query,
      state: request.state
    }));
  },
  complete (err, response, request, reply) {
    if (err) {
      return reply(err);
    }

    reply(response);
  }
};


module.exports.register = function register (server, pluginOptions, next) {
  server.handler('lambda', function createLambdaHandler (route, options) {
    let settings = Merge({}, defaults, pluginOptions, options);
    const validation = Joi.validate(settings, schema);

    if (validation.error) {
      throw validation.error;
    }

    settings = validation.value;

    const handler = function handler (request, reply) {
      settings.setup(request, function setupCb (err, payload) {
        if (err) {
          return settings.complete(err, payload, request, reply);
        }

        // TODO: Allow invoking the local code for testing

        const lambda = settings.lambda || new Aws.Lambda(settings.config);

        lambda.invoke({
          FunctionName: settings.name,
          Payload: payload
        }, function invokeCb (err, response) {
          settings.complete(err, response, request, reply);
        });
      });
    };

    handler[settingsSymbol] = settings;

    return handler;
  });

  server.ext({
    type: 'onPreStart',
    method (server, next) {
      Insync.eachSeries(server.connections, function eachConnection (conn, cb) {
        Insync.eachSeries(conn.table(), function eachRoute (route, callback) {
          const handler = route.settings.handler;
          const settings = handler[settingsSymbol];

          // Skip non-lambda routes
          if (typeof settings !== 'object') {
            return callback();
          }

          const deploy = settings.deploy;

          // Only process routes that want to be deployed at startup
          if (typeof deploy !== 'object') {
            return callback();
          }

          Bundler.bundle({
            entry: deploy.source,
            export: deploy.export,
            deploy: {
              config: settings.config,
              name: settings.name,
              role: settings.role
            }
          }, function bundlerCb (err, buffer, artifacts) {
            if (err) {
              return callback(err);
            }

            settings.lambda = artifacts.lambda;
            callback();
          });
        }, cb);
      }, next);
    }
  });

  next();
};


module.exports.register.attributes = {
  pkg: require('../package.json')
};
