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
      // The function can then be invoked via this route. When the server
      // shuts down, the lambda function is deleted.
      method: 'GET',
      path: '/hello-world',
      config: {
        handler: {
          lambda: {
            name: 'hello-world',
            deploy: {
              source: Path.join(__dirname, 'hello-world.js'),
              export: 'handler',
              teardown: true
            }
          }
        }
      }
    },
    {
      // This demonstrates a lambda that returns an error
      method: 'GET',
      path: '/error-response',
      config: {
        handler: {
          lambda: {
            name: 'error-response',
            deploy: {
              source: Path.join(__dirname, 'error-response.js'),
              export: 'handler',
              teardown: true
            }
          }
        }
      }
    },
    {
      // This lambda returns its event and context values
      method: 'GET',
      path: '/echo-inputs',
      config: {
        handler: {
          lambda: {
            name: 'echo-inputs',
            deploy: {
              source: Path.join(__dirname, 'echo-inputs.js'),
              export: 'handler',
              teardown: true
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

    // Handle Control+C so the server can be stopped and lambdas torn down
    process.on('SIGINT', () => {
      console.log('Shutting down server...');
      server.stop((err) => {
        if (err) {
          throw err;
        }

        process.exit(0);
      });
    });

    console.log(`Server started at ${server.info.uri}`);
  });
});
