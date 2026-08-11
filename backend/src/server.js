const http = require('node:http');
const { config } = require('./config/environment');
const {
  applyCorsHeaders,
  handleCorsPreflight,
  rejectDisallowedOrigin,
} = require('./middleware/cors');
const { enforceHttps } = require('./middleware/enforceHttps');
const { rejectPhoneDevice } = require('./middleware/rejectPhoneDevice');
const { applySecurityHeaders } = require('./middleware/securityHeaders');
const { routeRequest } = require('./routes');
const { sendJson } = require('./utils/http');

const handleRequest = async (request, response) => {
  if (handleCorsPreflight(request, response)) {
    return;
  }

  if (
    enforceHttps(request, response) ||
    rejectDisallowedOrigin(request, response) ||
    rejectPhoneDevice(request, response)
  ) {
    return;
  }

  await routeRequest(request, response);
};

const server = http.createServer((request, response) => {
  applySecurityHeaders(response);
  applyCorsHeaders(request, response);

  handleRequest(request, response).catch((error) => {
    console.error('Unhandled backend request error.', error);

    if (!response.headersSent) {
      sendJson(response, 500, {
        message: 'Internal server error.',
      });
      return;
    }

    response.destroy(error);
  });
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `Port ${config.port} is already in use. Choose another PORT value.`,
    );
  } else {
    console.error('The backend server could not start.', error);
  }

  process.exitCode = 1;
});

server.listen(config.port, () => {
  console.log(`Agrisell backend is running at http://localhost:${config.port}`);
});

const stopServer = (signal) => {
  console.log(`\nReceived ${signal}. Stopping the backend...`);
  server.close(() => process.exit(0));
};

process.on('SIGINT', () => stopServer('SIGINT'));
process.on('SIGTERM', () => stopServer('SIGTERM'));
