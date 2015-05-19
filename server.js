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
