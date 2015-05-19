# 使用 Node.js cluster 模块实现 graceful reload


Node.js 由于是单线程的，为了更好的利用多核，官方提供了 cluster 模块。
cluster 模块可以让开发者很容易的创建子进程，这些子进程共享端口。

以下是官网的一段使用 cluster 使用的样例代码：

```
var cluster = require('cluster');
var http = require('http');
var numCPUs = require('os').cpus().length;

if (cluster.isMaster) {
  // Fork workers.
  for (var i = 0; i < numCPUs; i++) {
    cluster.fork();
  }

  cluster.on('exit', function(worker, code, signal) {
    console.log('worker ' + worker.process.pid + ' died');
  });
} else {
  // Workers can share any TCP connection
  // In this case its a HTTP server
  http.createServer(function(req, res) {
    res.writeHead(200);
    res.end("hello world\n");
  }).listen(8000);
}
```

Node.js 中 cluster 模块 fork 出的工作进程与主进程的实现[IPC](http://zh.wikipedia.org/wiki/%E8%A1%8C%E7%A8%8B%E9%96%93%E9%80%9A%E8%A8%8A)的方式是管道（pipe），具体实现细节由libuv提供，在Windows下由命名管道（named pipe）实现，*nix系统则采用Unix Domain Socket实现。表现在应用层上的进程间通信只有简单的　message　事件和　send() 方法，接口十分简单和消息化。

graceful reload 的好处想必大家都知道，有一点就是快，比 stop -> start　快很多，这样时间窗口小，可以尽量减少在重启的过程中，客户端返回服务端时，报一堆的异常。

先把代码贴出来了：

+ TCP server

```
var net = require('net');

var server = net.createServer(function (client) {
  client.on('data', function (data) {
    console.log(data.toString());
    client.write('hello world');
  });

  client.on('end', function () {
    console.log('recv fin packet');
  });

  client.on('close', function () {
    console.log('connection fully closed');
  });
});

module.exports = server;
```

+ 核心 graceful reload 实现代码

```
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
        // Set timeout to force worker reload.
        var timeout = setTimeout(function () {
          process.send(FULLY_CLOSED);
        }, 100000);

        server.once('close', function () {
          // server fully closed.
          console.log('dsdsd');
          clearTimeout(timeout);
          process.send(FULLY_CLOSED);
        });

        // server starts to refuse accept new connection.
        server.close();
      }
    });
  }
};

run();
```

TCP server 的代码没啥好说的，这里就是创建一个 TCP server 对象，然后对 client 这个对象，初始化所要监听的事件，因为后面的实验会使用到。
