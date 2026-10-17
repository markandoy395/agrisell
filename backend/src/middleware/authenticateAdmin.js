const { config } = require('../config/environment');
const { isAdminRole } = require('../config/roles');
const { parseCookies } = require('../utils/cookies');
const { getHeaderValue, sendJson } = require('../utils/http');
const { verifySession } = require('../services/sessionService');

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

const authenticateAdmin = async (request, response) => {
  const session = await verifySession(getSessionToken(request));

  if (!session) {
    sendJson(response, 401, {
      code: 'AUTHENTICATION_REQUIRED',
      message: 'A valid admin session is required.',
    });
    return null;
  }

  if (!isAdminRole(session.role)) {
    sendJson(response, 403, {
      code: 'ADMIN_ROLE_REQUIRED',
      message: 'Access denied. Administrator role is required for this action.',
    });
    return null;
  }

  request.admin = session;
  request.user = session;
  return session;
};

module.exports = { authenticateAdmin, getSessionToken };
