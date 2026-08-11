const { config } = require('../config/environment');
const { getHeaderValue, sendJson } = require('../utils/http');

const isHttpsRequest = (request) => {
  const forwardedProto = getHeaderValue(request.headers['x-forwarded-proto']);

  return request.socket.encrypted || forwardedProto === 'https';
};

const enforceHttps = (request, response) => {
  if (!config.requireHttps || isHttpsRequest(request)) {
    return false;
  }

  sendJson(response, 403, {
    code: 'HTTPS_REQUIRED',
    message: 'Secure HTTPS access is required for this API.',
  });

  return true;
};

module.exports = { enforceHttps };
