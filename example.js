/**
 * Use Node.js cluster module implement graceful reload TCP/HTTP server.
 */

var cluster = require('cluster');
var net = require('net');
var os = require('os');

var cpuNums = os.cpus().length;

var GRACEFUL_SHUT = 'graceful_shutdown';
var FULLY_CLOSED = 'fully_closed';

var server = require('./server');

/**
 * Run test server.
 */
var run = function () {
  if (cluster.isMaster) {
    var i = 0;
    // Create workers.
    for (i = 0; i < cpuNums; i++) {
      cluster.fork();
    }

    // Woker uncaught exit.
    cluster.on('exit', function (worker, code, signal) {
      if (!worker.suicide) {
        console.log('worker %d died (%s). restarting...',
          worker.process.pid, signal || code);
        cluster.fork();
      }
    });

    // Worker has started.
    cluster.on('online', function (worker) {
      console.log('worker %d has stared', worker.process.pid);
    });

    // Listen SIGHUP for graceful reload.
    process.on('SIGHUP', function () {
      Object.keys(cluster.workers).forEach(function (id) {
        // Tell worker doesn't accept new connection.
        cluster.workers[id].send(GRACEFUL_SHUT);

        cluster.workers[id].on('message', function (msg) {
          if (msg === FULLY_CLOSED) {
            // Worker kills itself.
            cluster.workers[id].kill();

            // Reload.
            cluster.fork();
          }
        });
      });
    });

  } else {
    server.listen(11111);

    process.on('message', function (msg) {
      // If msg is equal GRACEFUL_SHUT, worker graceful restarts.
      if (msg === GRACEFUL_SHUT) {
        // server starts to refuse accept new connection.
        server.close();

        // Set timeout to force worker reload.
        var timeout = setTimeout(function () {
          process.send(FULLY_CLOSED);
        }, 100000);

        server.once('close', function () {
          // server fully closed.
          clearTimeout(timeout);
          process.send(FULLY_CLOSED);
        });
      }
    });
  }
};

run();
