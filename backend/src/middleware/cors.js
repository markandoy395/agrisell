const { config } = require('../config/environment');
const { getHeaderValue, sendJson, sendNoContent } = require('../utils/http');

const isAllowedLocalViteOrigin = (origin) => {
  if (!config.allowLocalViteOrigins) {
    return false;
  }

  try {
    const parsedOrigin = new URL(origin);
    const port = Number.parseInt(parsedOrigin.port, 10);
    const isLocalHostname =
      parsedOrigin.hostname === 'localhost' ||
      parsedOrigin.hostname === '127.0.0.1';

    return (
      parsedOrigin.protocol === 'http:' &&
      isLocalHostname &&
      port >= config.localVitePortMin &&
      port <= config.localVitePortMax
    );
  } catch {
    return false;
  }
};

const getAllowedOrigin = (request) => {
  const origin = getHeaderValue(request.headers.origin);

  if (
    !origin ||
    (!config.allowedOrigins.includes(origin) && !isAllowedLocalViteOrigin(origin))
  ) {
    return null;
  }

  return origin;
};

const applyCorsHeaders = (request, response) => {
  const origin = getAllowedOrigin(request);

  if (!origin) return;

  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type',
  );
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  response.setHeader('Vary', 'Origin');
};

const rejectDisallowedOrigin = (request, response) => {
  const origin = getHeaderValue(request.headers.origin);

  if (!origin || getAllowedOrigin(request)) {
    return false;
  }

  sendJson(response, 403, {
    code: 'ORIGIN_NOT_ALLOWED',
    message: 'This request origin is not allowed.',
  });

  return true;
};

const handleCorsPreflight = (request, response) => {
  if (request.method !== 'OPTIONS') {
    return false;
  }

  if (rejectDisallowedOrigin(request, response)) {
    return true;
  }

  sendNoContent(response);
  return true;
};

module.exports = {
  applyCorsHeaders,
  handleCorsPreflight,
  rejectDisallowedOrigin,
};
