const http = require('node:http');
const { rejectMobileDevice } = require('./middleware/rejectMobileDevice');

const port = Number.parseInt(process.env.PORT ?? '3001', 10);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error('PORT must be an integer between 1 and 65535.');
}

const sendJson = (response, statusCode, body) => {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
};

const server = http.createServer((request, response) => {
  if (rejectMobileDevice(request, response)) {
    return;
  }

  if (request.method === 'GET' && request.url === '/api/health') {
    sendJson(response, 200, {
      status: 'ok',
      service: 'agrisell-backend',
    });
    return;
  }

  sendJson(response, 404, { message: 'Route not found.' });
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${port} is already in use. Choose another PORT value.`);
  } else {
    console.error('The backend server could not start.', error);
  }

  process.exitCode = 1;
});

server.listen(port, () => {
  console.log(`Agrisell backend is running at http://localhost:${port}`);
});

const stopServer = (signal) => {
  console.log(`\nReceived ${signal}. Stopping the backend...`);
  server.close(() => process.exit(0));
};

process.on('SIGINT', () => stopServer('SIGINT'));
process.on('SIGTERM', () => stopServer('SIGTERM'));
