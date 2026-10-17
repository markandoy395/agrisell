const {
  confirmPasswordResetCode,
  getCurrentSession,
  loginAdmin,
  logoutAdmin,
  requestPasswordResetCode,
} = require('../controllers/authController');

const { sendJson } = require('../utils/http');

const routeAuthRequest = async (request, response, pathname) => {
  if (pathname === '/api/auth/login' && request.method === 'POST') {
    await loginAdmin(request, response);
    return true;
  }

  if (pathname === '/api/auth/mfa/verify' && request.method === 'POST') {
    sendJson(response, 400, {
      code: 'MFA_NOT_SUPPORTED',
      message: 'MFA verification requires Supabase authentication.',
    });
    return true;
  }

  if (pathname === '/api/auth/session' && request.method === 'GET') {
    await getCurrentSession(request, response);
    return true;
  }

  if (pathname === '/api/auth/password-reset' && request.method === 'POST') {
    await requestPasswordResetCode(request, response);
    return true;
  }

  if (
    pathname === '/api/auth/password-reset/confirm' &&
    request.method === 'POST'
  ) {
    await confirmPasswordResetCode(request, response);
    return true;
  }

  if (pathname === '/api/auth/logout' && request.method === 'POST') {
    await logoutAdmin(request, response);
    return true;
  }

  return false;
};

module.exports = { routeAuthRequest };
