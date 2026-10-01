const { getSessionToken } = require('../../middleware/authenticateAdmin');
const { enforceAuthenticationRateLimit } = require('../../middleware/rateLimit');
const { config } = require('../../config/environment');
const { authenticateAdminCredentials } = require('../../services/adminAuthService');
const { createAdminSession, revokeAdminSession, verifyAdminSession } = require('../../services/sessionService');
const { sendJson } = require('../../utils/http');
const { readObjectBody, requireJsonContentType } = require('./authRequestValidation');
const { getExpiredSessionCookie, getSessionCookie } = require('./authSessionCookie');
const { recordSecurityEvent } = require('../admin/security/adminSecurityService');

const loginAdmin = async (request, response) => {
  if (!requireJsonContentType(
    request, response, 'Login requests must use application/json.',
  )) return;
  const body = await readObjectBody({
    code: 'INVALID_LOGIN_PAYLOAD',
    maxBytes: 2_000,
    message: 'Enter your admin email and password.',
    request,
    response,
  });
  if (!body) return;
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password || email.length > 254 || password.length > 512) {
    sendJson(response, 400, {
      code: 'INVALID_LOGIN_PAYLOAD',
      message: 'Enter your admin email and password.',
    });
    return;
  }
  if (!await enforceAuthenticationRateLimit(request, response, 'login', email)) return;
  const authResult = await authenticateAdminCredentials(email, password);
  if (!authResult.success) {
    const unavailable = ['AUTH_NOT_CONFIGURED', 'DATABASE_UNAVAILABLE']
      .includes(authResult.reason);
    if (!unavailable && config?.hasSupabaseAdminAccess) {
      await recordSecurityEvent(email.toLowerCase(), 'sign_in_failed', authResult.reason);
    }
    sendJson(response, unavailable ? 503 : 401, {
      code: authResult.reason,
      message: unavailable
        ? authResult.reason === 'DATABASE_UNAVAILABLE'
          ? 'The admin account service is unavailable. Please try again.'
          : 'Admin login is not configured on the server.'
        : 'Invalid admin email or password.',
    }, { 'Set-Cookie': getExpiredSessionCookie() });
    return;
  }
  const token = await createAdminSession(authResult.admin);
  if (config?.hasSupabaseAdminAccess) {
    void recordSecurityEvent(authResult.admin.email, 'signed_in', 'Administrator signed in.');
  }
  sendJson(response, 200, {
    admin: authResult.admin,
    authenticated: true,
  }, { 'Set-Cookie': getSessionCookie(token) });
};

const getCurrentSession = async (request, response) => {
  const admin = await verifyAdminSession(getSessionToken(request));
  if (!admin) {
    sendJson(response, 200, { authenticated: false }, {
      'Set-Cookie': getExpiredSessionCookie(),
    });
    return;
  }
  sendJson(response, 200, { admin, authenticated: true });
};

const logoutAdmin = async (request, response) => {
  const admin = await verifyAdminSession(getSessionToken(request));
  if (admin?.session?.id) await revokeAdminSession(admin.session.id);
  sendJson(response, 200, { authenticated: false }, {
    'Set-Cookie': getExpiredSessionCookie(),
  });
};

module.exports = { getCurrentSession, loginAdmin, logoutAdmin };
