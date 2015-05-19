# 使用 Node.js cluster 模块实现 graceful reload


Node.js 由于是单线程的，为了更好的利用多核，官方提供了 cluster 模块。
cluster 模块可以让开发者很容易的创建子进程，这些子进程共享端口。

以下是官网的一段使用 cluster 的例子代码：

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

