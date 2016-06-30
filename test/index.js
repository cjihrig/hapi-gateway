'use strict';

const Path = require('path');
const AwsMock = require('aws-sdk-mock');
const Bundler = require('lambundaler');
const Code = require('code');
const Hapi = require('hapi');
const Lab = require('lab');
const StandIn = require('stand-in');
const Plugin = require('../lib');

const lab = exports.lab = Lab.script();
const expect = Code.expect;
const describe = lab.describe;
const it = lab.it;

const fixturesDir = Path.join(__dirname, 'fixtures');

function prepareServer (options, callback) {
  const server = new Hapi.Server();

  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  options.plugin = options.plugin || {
    role: 'arn:aws:iam::12345:role/lambda_basic_execution'
  };

  options.routes = options.routes || [
    {
      method: 'GET',
      path: '/foo',
      config: {
        handler: {
          lambda: {
            name: 'foo'
          }
        }
      }
    }
  ];

  server.connection(options.connection);
  server.register([{ register: Plugin, options: options.plugin }], (err) => {
    if (err) {
      return callback(err);
    }

    server.route(options.routes);
    server.initialize((err) => {
      callback(err, server);
    });
  });
}

describe('hapi Gateway', () => {
  it('invokes the lambda function', (done) => {
    AwsMock.mock('Lambda', 'invoke', function (options, callback) {
      callback(null, { StatusCode: 200, Payload: 'foobar' });
    });

    prepareServer((err, server) => {
      expect(err).to.not.exist();

      server.inject({
        method: 'GET',
        url: '/foo'
      }, (res) => {
        AwsMock.restore('Lambda', 'invoke');
        expect(res.statusCode).to.equal(200);
        expect(res.result).to.equal('foobar');
        server.stop(done);
      });
    });
  });

  it('accepts a custom setup function', (done) => {
    const options = {
      routes: [
        {
          method: 'GET',
          path: '/foo',
          config: {
            handler: {
              lambda: {
                name: 'foo',
                setup (request, callback) {
                  callback(null, { foo: 'bar' });
                }
              }
            }
          }
        }
      ]
    };

    AwsMock.mock('Lambda', 'invoke', function (options, callback) {
      callback(null, { StatusCode: 200, Payload: options.Payload });
    });

    prepareServer(options, (err, server) => {
      expect(err).to.not.exist();

      server.inject({
        method: 'GET',
        url: '/foo'
      }, (res) => {
        AwsMock.restore('Lambda', 'invoke');
        expect(res.statusCode).to.equal(200);
        expect(res.result).to.equal({ foo: 'bar' });
        server.stop(done);
      });
    });
  });

  it('handles errors from the setup function', (done) => {
    const options = {
      routes: [
        {
          method: 'GET',
          path: '/foo',
          config: {
            handler: {
              lambda: {
                name: 'foo',
                setup (request, callback) {
                  callback(new Error('foo'));
                }
              }
            }
          }
        }
      ]
    };

    prepareServer(options, (err, server) => {
      expect(err).to.not.exist();

      server.inject({
        method: 'GET',
        url: '/foo'
      }, (res) => {
        expect(res.statusCode).to.equal(500);
        server.stop(done);
      });
    });
  });

  it('accepts a custom complete function', (done) => {
    const options = {
      routes: [
        {
          method: 'GET',
          path: '/foo',
          config: {
            handler: {
              lambda: {
                name: 'foo',
                complete (ignoreErr, response, request, reply) {
                  reply('foobar');
                }
              }
            }
          }
        }
      ]
    };

    AwsMock.mock('Lambda', 'invoke', function (options, callback) {
      callback(null, options);
    });

    prepareServer(options, (err, server) => {
      expect(err).to.not.exist();

      server.inject({
        method: 'GET',
        url: '/foo'
      }, (res) => {
        AwsMock.restore('Lambda', 'invoke');
        expect(res.statusCode).to.equal(200);
        expect(res.result).to.equal('foobar');
        server.stop(done);
      });
    });
  });

  it('handles errors from AWS', (done) => {
    AwsMock.mock('Lambda', 'invoke', function (options, callback) {
      callback(new Error('foo'));
    });

    prepareServer((err, server) => {
      expect(err).to.not.exist();

      server.inject({
        method: 'GET',
        url: '/foo'
      }, (res) => {
        AwsMock.restore('Lambda', 'invoke');
        expect(res.statusCode).to.equal(500);
        server.stop(done);
      });
    });
  });

  it('throws if input validation fails', (done) => {
    const options = {
      routes: [
        {
          method: 'GET',
          path: '/foo',
          config: { handler: { lambda: {} } }
        }
      ]
    };

    expect(() => {
      prepareServer(options, (ignoreErr, server) => {});
    }).to.throw(Error);
    done();
  });

  it('only deploys lambda routes that are configured to do so', (done) => {
    const stand = StandIn.replace(Bundler, 'bundle', (stand, options, callback) => {
      callback(null, null, {});
    });

    const options = {
      plugin: {
        role: 'arn:aws:iam::12345:role/lambda_basic_execution',
        config: {
          accessKeyId: 'foo',
          secretAccessKey: 'bar',
          region: 'us-east-1'
        }
      },
      routes: [
        // non-lambda route
        {
          method: 'GET',
          path: '/baz',
          handler (request, reply) {
            reply('baz');
          }
        },
        // lambda route with no deploy information
        {
          method: 'GET',
          path: '/bar',
          config: {
            handler: {
              lambda: {
                name: 'bar'
              }
            }
          }
        },
        // lambda route with deploy information
        {
          method: 'GET',
          path: '/foo',
          config: {
            handler: {
              lambda: {
                name: 'foo',
                deploy: {
                  source: Path.join(fixturesDir, 'index.js'),
                  export: 'handler'
                }
              }
            }
          }
        }
      ]
    };

    prepareServer(options, (err, server) => {
      stand.restore();
      expect(stand.invocations).to.equal(1);
      expect(err).to.not.exist();
      server.stop(done);
    });
  });

  it('handles deployment errors', (done) => {
    const stand = StandIn.replace(Bundler, 'bundle', (stand, options, callback) => {
      callback(new Error('foo'));
    });

    const options = {
      plugin: {
        role: 'arn:aws:iam::12345:role/lambda_basic_execution',
        config: {
          accessKeyId: 'foo',
          secretAccessKey: 'bar',
          region: 'us-east-1'
        }
      },
      routes: [
        {
          method: 'GET',
          path: '/foo',
          config: {
            handler: {
              lambda: {
                name: 'foo',
                deploy: {
                  source: Path.join(fixturesDir, 'index.js'),
                  export: 'handler'
                }
              }
            }
          }
        }
      ]
    };

    prepareServer(options, (err, server) => {
      stand.restore();
      expect(err).to.be.an.error(Error, 'foo');
      server.stop(done);
    });
  });

  it('deletes functions when teardown is true', (done) => {
    const bundleStand = StandIn.replace(Bundler, 'bundle', (stand, options, callback) => {
      callback(null, null, {});
    });

    const options = {
      plugin: {
        role: 'arn:aws:iam::12345:role/lambda_basic_execution',
        config: {
          accessKeyId: 'foo',
          secretAccessKey: 'bar',
          region: 'us-east-1'
        }
      },
      routes: [
        // lambda route with no deploy information
        {
          method: 'GET',
          path: '/baz',
          config: {
            handler: {
              lambda: {
                name: 'baz'
              }
            }
          }
        },
        // lambda route with deploy information but no teardown
        {
          method: 'GET',
          path: '/bar',
          config: {
            handler: {
              lambda: {
                name: 'bar',
                deploy: {
                  source: Path.join(fixturesDir, 'index.js'),
                  export: 'handler'
                }
              }
            }
          }
        },
        // lambda route with deploy information and teardown
        {
          method: 'GET',
          path: '/foo',
          config: {
            handler: {
              lambda: {
                name: 'foo',
                deploy: {
                  source: Path.join(fixturesDir, 'index.js'),
                  export: 'handler',
                  teardown: true
                }
              }
            }
          }
        }
      ]
    };

    prepareServer(options, (err, server) => {
      bundleStand.restore();
      expect(bundleStand.invocations).to.equal(2);
      expect(err).to.not.exist();

      AwsMock.mock('Lambda', 'deleteFunction', function (options, callback) {
        callback(null, {});
      });

      server.stop((err) => {
        AwsMock.restore('Lambda', 'deleteFunction');
        expect(err).to.not.exist();
        done();
      });
    });
  });
});
