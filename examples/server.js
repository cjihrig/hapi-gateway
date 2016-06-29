'use strict';

const Path = require('path');
const Hapi = require('hapi');
const Gateway = require('../lib');
const server = new Hapi.Server();

server.connection();
server.register([
  {
    register: Gateway,
    // These are options that are applied to all lambda handlers
    options: {
      role: 'arn:aws:iam::XXXX:role/lambda_basic_execution',  // IAM role
      config: {
        accessKeyId: 'YOUR_ACCESS_KEY',                       // access key
        secretAccessKey: 'YOUR_SECRET_KEY',                   // secret key
        region: 'YOUR_REGION'                                 // region
      }
    }
  }
], (err) => {
  if (err) {
    throw err;
  }

  server.route([
    {
      // This is a "normal" hapi route.
      method: 'GET',
      path: '/typical',
      handler (request, reply) {
        reply('a typical hapi route');
      }
    },
    {
      // This calls a lambda function that is already deployed as "foo".
      // If you haven't deployed this already, the route will return a 500.
      method: 'GET',
      path: '/already-deployed',
      config: {
        handler: {
          lambda: {
            name: 'foo'
          }
        }
      }
    },
    {
      // This deploys the lambda function code in deploy.source at startup.
      // The function can then be invoked via this route.
      method: 'GET',
      path: '/hello-world',
      config: {
        handler: {
          lambda: {
            name: 'hello-world',
            deploy: {
              source: Path.join(__dirname, 'hello-world.js'),
              export: 'handler'
            }
          }
        }
      }
    }
  ]);

  server.start((err) => {
    if (err) {
      throw err;
    }

    console.log(`Server started at ${server.info.uri}`);
  });
});
