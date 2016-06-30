# hapi-gateway

[![Current Version](https://img.shields.io/npm/v/hapi-gateway.svg)](https://www.npmjs.org/package/hapi-gateway)
[![Build Status via Travis CI](https://travis-ci.org/continuationlabs/hapi-gateway.svg?branch=master)](https://travis-ci.org/continuationlabs/hapi-gateway)
![Dependencies](http://img.shields.io/david/continuationlabs/hapi-gateway.svg)

[![belly-button-style](https://cdn.rawgit.com/continuationlabs/belly-button/master/badge.svg)](https://github.com/continuationlabs/belly-button)

`hapi-gateway` is a hapi plugin that allows a hapi server to act as an API Gateway to AWS Lambda functions. `hapi-gateway` defines a new `lambda` handler type. When a lambda route handler is accessed, it invokes the backing the AWS Lambda function.

`hapi-gateway` allows your Lambda function code to be deployed along with your hapi server. A lambda handler can be associated with a file containing your Lambda function code. When the hapi server starts, the code is deployed to AWS (overwriting any existing Lambda function of the same name). Optionally, the Lambda function can be removed from AWS when the hapi server is shut down.

## Example

The following example creates a hapi server. On server startup, a Lambda function is deployed to AWS. The Lambda can be invoked via the `GET /hello-world` route. When the hapi server stops, the Lambda function is automatically deleted. A `SIGINT` signal handler has been added to catch `Control+C` and gracefully shutdown the server.

```javascript
'use strict';

const Path = require('path');
const Hapi = require('hapi');
const Gateway = require('hapi-gateway');
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
```

The corresponding Lambda function code, which is loaded from `'hello-world.js'`, is shown below:

```javascript
'use strict';

module.exports.handler = function handler (event, context, callback) {
  callback(null, 'hello world!');
};
```

## API

On plugin registration, `hapi-gateway` defines a new handler type named `lambda`. These routes are configured using an object with the following schema.

- `name` (string) - The name of the Lambda function to invoke.
- `setup(request, callback)` (function) - An optional function that creates the request payload sent to the Lambda function. `request` is the hapi request object associated with the route. Once `setup()` is complete, `callback()` is invoked with an error argument, followed by the payload to send to the Lambda function. If a custom `setup()` function is not provided, a default function is used which outputs a JSON string representing much of hapi request object.
- `complete(err, response, request, reply)` (function) - An optional function that converts the Lambda function's response into a client reply. `err` and `response` are the error and response from the Lambda function. `request` and `reply` are the hapi request and reply objects.
- `config` (object) - An optional configuration object passed directly to the [`Aws.Lambda()`](http://docs.aws.amazon.com/AWSJavaScriptSDK/latest/AWS/Lambda.html#constructor-property) constructor.
- `role` (string) - An AWS role with permission to execute the Lambda.
- `deploy` (object) - An optional object used to deploy code as an AWS Lambda. Code is deployed at server startup using an `'onPreStart'` extension point. If this object is not provided, then the user is responsible for deploying the code prior to starting the server. If this object is present, it must adhere to the following schema.
  - `source` (string) - The path to a file containing Lambda function code.
  - `export` (string) - The name of the exported function in `source` that acts as the Lambda function's entry point.
  - `teardown` (boolean) - If `true`, the deployed Lambda function is deleted when the hapi server shuts down. The deletion is done during an `'onPostStop'` extension point. Defaults to `false`, meaning the deployed function is not deleted.

It is worth noting that the same options can be provided to the plugin's `register()` function. The configuration for each route is used by merging the module defaults, the plugin registration options, and the individual route options (in order of increasing priority).
