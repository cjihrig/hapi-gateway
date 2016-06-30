'use strict';

const Aws = require('aws-sdk');
const Bundler = require('lambundaler');
const Insync = require('insync');
const Joi = require('joi');

const settingsSymbol = Symbol('settings');

const schema = Joi.object({
  name: Joi.string().required().description('name of lambda to invoke'),
  setup: Joi.func().required().arity(2).description('custom setup function'),
  complete: Joi.func().required().arity(4).description('custom complete function'),
  config: Joi.object().optional().default({}).description('general AWS config'),
  role: Joi.string().required().description('AWS role with execute permissions'),
  deploy: Joi.object().keys({
    source: Joi.string().required().description('path to lambda source code'),
    export: Joi.string().required().description('export used as lambda handler'),
    teardown: Joi.boolean().optional().default(false).description('delete function when the server shuts down')
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

    const payload = tryParse(response.Payload);

    reply(payload).code(response.StatusCode);
  }
};


function tryParse (data) {
  try {
    return JSON.parse(data);
  } catch (err) {
    return data;
  }
}


function forEachLambdaHandler (server, fn, callback) {
  Insync.eachSeries(server.connections, function eachConnection (conn, cb) {
    Insync.eachSeries(conn.table(), function eachRoute (route, next) {
      const handler = route.settings.handler;
      const settings = handler[settingsSymbol];

      // Skip non-lambda routes
      if (typeof settings !== 'object') {
        return next();
      }

      fn(settings, next);
    }, cb);
  }, callback);
}


module.exports.register = function register (server, pluginOptions, next) {
  server.handler('lambda', function createLambdaHandler (route, options) {
    let settings = Object.assign({}, defaults, pluginOptions, options);
    const validation = Joi.validate(settings, schema);

    if (validation.error) {
      throw validation.error;
    }

    settings = validation.value;

    const lambda = new Aws.Lambda(settings.config);

    settings.lambda = lambda;

    const handler = function handler (request, reply) {
      settings.setup(request, function setupCb (err, payload) {
        if (err) {
          return settings.complete(err, payload, request, reply);
        }

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
      forEachLambdaHandler(server, function maybeDeploy (settings, cb) {
        const deploy = settings.deploy;

        // Only process routes that want to be deployed at startup
        if (typeof deploy !== 'object') {
          return cb();
        }

        Bundler.bundle({
          entry: deploy.source,
          export: deploy.export,
          deploy: {
            config: settings.config,
            name: settings.name,
            role: settings.role,
            overwrite: true
          }
        }, cb);
      }, next);
    }
  });

  server.ext({
    type: 'onPostStop',
    method (server, next) {
      forEachLambdaHandler(server, function maybeDelete (settings, cb) {
        const deploy = settings.deploy;

        // Only process routes that want to be destroyed at shutdown
        if (!(typeof deploy === 'object' && deploy.teardown === true)) {
          return cb();
        }

        settings.lambda.deleteFunction({ FunctionName: settings.name }, cb);
      }, next);
    }
  });

  next();
};


module.exports.register.attributes = {
  pkg: require('../package.json')
};
