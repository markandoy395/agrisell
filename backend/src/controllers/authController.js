const { config } = require('../config/environment');
const { authenticateAdminCredentials } = require('../services/adminAuthService');
const {
  AdminPasswordResetError,
  requestAdminPasswordReset,
  resetAdminPasswordWithCode,
} = require('../services/adminPasswordResetService');
const {
  createAdminSession,
  verifyAdminSession,
} = require('../services/sessionService');
const { serializeCookie } = require('../utils/cookies');
const { getHeaderValue, readJsonBody, sendJson } = require('../utils/http');
const { getSessionToken } = require('../middleware/authenticateAdmin');

const getSessionCookie = (token) =>
  serializeCookie(config.sessionCookieName, token, {
    httpOnly: true,
    maxAge: config.sessionTtlSeconds,
    path: '/',
    sameSite: config.sessionCookieSameSite,
    secure: config.secureCookies,
  });

const getExpiredSessionCookie = () =>
  serializeCookie(config.sessionCookieName, '', {
    httpOnly: true,
    maxAge: 0,
    path: '/',
    sameSite: config.sessionCookieSameSite,
    secure: config.secureCookies,
  });

const isObjectBody = (body) =>
  typeof body === 'object' && body !== null && !Array.isArray(body);

const handleRequestBodyError = (response, error) => {
  sendJson(response, error.statusCode ?? 400, {
    code: error.code ?? 'INVALID_REQUEST_BODY',
    message: error.message,
  });
};

const readPasswordResetBody = async (request, response) => {
  const contentType = getHeaderValue(request.headers['content-type']) ?? '';

  if (!contentType.includes('application/json')) {
    sendJson(response, 415, {
      code: 'JSON_REQUIRED',
      message: 'Password reset requests must use application/json.',
    });
    return null;
  }

  try {
    const body = await readJsonBody(request, { maxBytes: 2_000 });

    if (!isObjectBody(body)) {
      sendJson(response, 400, {
        code: 'INVALID_PASSWORD_RESET_PAYLOAD',
        message: 'Enter a valid email address.',
      });
      return null;
    }

    return body;
  } catch (error) {
    handleRequestBodyError(response, error);
    return null;
  }
};

const sendPasswordResetFailure = (response, error) => {
  if (error instanceof AdminPasswordResetError) {
    sendJson(response, error.statusCode, {
      code: error.code,
      message: error.message,
    });
    return;
  }

  console.error('Unable to complete the password recovery request.', error);
  sendJson(response, 502, {
    code: 'PASSWORD_RESET_UNAVAILABLE',
    message: 'Password recovery is temporarily unavailable. Please try again.',
  });
};

const loginAdmin = async (request, response) => {
  const contentType = getHeaderValue(request.headers['content-type']) ?? '';

  if (!contentType.includes('application/json')) {
    sendJson(response, 415, {
      code: 'JSON_REQUIRED',
      message: 'Login requests must use application/json.',
    });
    return;
  }

  let body;

  try {
    body = await readJsonBody(request, { maxBytes: 2_000 });
  } catch (error) {
    handleRequestBodyError(response, error);
    return;
  }

  if (!isObjectBody(body)) {
    sendJson(response, 400, {
      code: 'INVALID_LOGIN_PAYLOAD',
      message: 'Enter your admin email and password.',
    });
    return;
  }

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !password || email.length > 254 || password.length > 512) {
    sendJson(response, 400, {
      code: 'INVALID_LOGIN_PAYLOAD',
      message: 'Enter your admin email and password.',
    });
    return;
  }

  const authResult = await authenticateAdminCredentials(email, password);

  if (!authResult.success) {
    const isAuthUnavailable = [
      'AUTH_NOT_CONFIGURED',
      'DATABASE_UNAVAILABLE',
    ].includes(authResult.reason);

    sendJson(
      response,
      isAuthUnavailable ? 503 : 401,
      {
        code: authResult.reason,
        message: isAuthUnavailable
          ? authResult.reason === 'DATABASE_UNAVAILABLE'
            ? 'The admin account service is unavailable. Please try again.'
            : 'Admin login is not configured on the server.'
          : 'Invalid admin email or password.',
      },
      { 'Set-Cookie': getExpiredSessionCookie() },
    );
    return;
  }

  const token = createAdminSession(authResult.admin);

  sendJson(
    response,
    200,
    {
      admin: authResult.admin,
      authenticated: true,
    },
    { 'Set-Cookie': getSessionCookie(token) },
  );
};

const getCurrentSession = (request, response) => {
  const admin = verifyAdminSession(getSessionToken(request));

  if (!admin) {
    sendJson(
      response,
      200,
      { authenticated: false },
      { 'Set-Cookie': getExpiredSessionCookie() },
    );
    return;
  }

  sendJson(response, 200, {
    admin,
    authenticated: true,
  });
};

const logoutAdmin = (_request, response) => {
  sendJson(
    response,
    200,
    { authenticated: false },
    { 'Set-Cookie': getExpiredSessionCookie() },
  );
};

const requestPasswordResetCode = async (request, response) => {
  const body = await readPasswordResetBody(request, response);

  if (!body) return;

  const email = typeof body.email === 'string' ? body.email.trim() : '';

  if (!email || !email.includes('@') || email.length > 254) {
    sendJson(response, 400, {
      code: 'INVALID_PASSWORD_RESET_PAYLOAD',
      message: 'Enter a valid email address.',
    });
    return;
  }

  try {
    await requestAdminPasswordReset(email);
    sendJson(response, 200, {
      message: 'If an administrator account uses this email, a recovery code has been sent.',
    });
  } catch (error) {
    sendPasswordResetFailure(response, error);
  }
};

const confirmPasswordResetCode = async (request, response) => {
  const body = await readPasswordResetBody(request, response);

  if (!body) return;

  const email = typeof body.email === 'string' ? body.email.trim() : '';
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';

  if (!email || !email.includes('@') || email.length > 254 || !/^\d{6}$/.test(code)) {
    sendJson(response, 400, {
      code: 'INVALID_PASSWORD_RESET_PAYLOAD',
      message: 'Enter your email address and the 6-digit recovery code.',
    });
    return;
  }

  if (password.length < 8 || password.length > 512) {
    sendJson(response, 400, {
      code: 'INVALID_PASSWORD_RESET_PAYLOAD',
      message: 'Your new password must be between 8 and 512 characters.',
    });
    return;
  }

  try {
    await resetAdminPasswordWithCode({ code, email, password });
    sendJson(
      response,
      200,
      { message: 'Your password has been updated. You can now log in.' },
      { 'Set-Cookie': getExpiredSessionCookie() },
    );
  } catch (error) {
    sendPasswordResetFailure(response, error);
  }
};

module.exports = {
  confirmPasswordResetCode,
  getCurrentSession,
  loginAdmin,
  logoutAdmin,
  requestPasswordResetCode,
};
