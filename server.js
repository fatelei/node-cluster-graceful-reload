var net = require('net');

var server = net.createServer(function (client) {
  client.write('hello world 1');
});

module.exports = server;
