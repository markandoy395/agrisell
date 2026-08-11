const { config } = require('../config/environment');
const { parseCookies } = require('../utils/cookies');
const { getHeaderValue, sendJson } = require('../utils/http');
const { verifyAdminSession } = require('../services/sessionService');

const getBearerToken = (request) => {
  const authorization = getHeaderValue(request.headers.authorization);

  if (!authorization?.startsWith('Bearer ')) {
    return null;
  }

  return authorization.slice('Bearer '.length).trim();
};

const getSessionToken = (request) => {
  const cookies = parseCookies(request);

  return getBearerToken(request) ?? cookies[config.sessionCookieName] ?? null;
};

const authenticateAdmin = (request, response) => {
  const admin = verifyAdminSession(getSessionToken(request));

  if (!admin) {
    sendJson(response, 401, {
      code: 'AUTHENTICATION_REQUIRED',
      message: 'A valid admin session is required.',
    });
    return null;
  }

  if (admin.role !== 'admin') {
    sendJson(response, 403, {
      code: 'ADMIN_PERMISSION_REQUIRED',
      message: 'Admin permission is required.',
    });
    return null;
  }

  request.admin = admin;
  return admin;
};

module.exports = { authenticateAdmin, getSessionToken };
