const {
  AdminPasswordResetError,
  requestAdminPasswordReset,
  resetAdminPasswordWithCode,
} = require('../../services/adminPasswordResetService');
const { sendJson } = require('../../utils/http');
const { enforceAuthenticationRateLimit } = require('../../middleware/rateLimit');
const { recordSecurityEvent } = require('../admin/security/adminSecurityService');
const { readObjectBody, requireJsonContentType } = require('./authRequestValidation');
const { getExpiredSessionCookie } = require('./authSessionCookie');

const readPasswordResetBody = async (request, response) => {
  if (!requireJsonContentType(
    request, response, 'Password reset requests must use application/json.',
  )) return null;
  return readObjectBody({
    code: 'INVALID_PASSWORD_RESET_PAYLOAD',
    maxBytes: 2_000,
    message: 'Enter a valid email address.',
    request,
    response,
  });
};

const sendPasswordResetFailure = (response, error) => {
  if (error instanceof AdminPasswordResetError) {
    sendJson(response, error.statusCode, { code: error.code, message: error.message });
    return;
  }
  console.error('Unable to complete the password recovery request.', error);
  sendJson(response, 502, {
    code: 'PASSWORD_RESET_UNAVAILABLE',
    message: 'Password recovery is temporarily unavailable. Please try again.',
  });
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
  if (!await enforceAuthenticationRateLimit(
    request, response, 'passwordResetRequest', email,
  )) return;
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
  if (!await enforceAuthenticationRateLimit(
    request, response, 'passwordResetConfirm', email,
  )) return;
  try {
    await resetAdminPasswordWithCode({ code, email, password });
    sendJson(response, 200, {
      message: 'Your password has been updated. You can now log in.',
    }, { 'Set-Cookie': getExpiredSessionCookie() });
  } catch (error) {
    if (error instanceof AdminPasswordResetError && error.code === 'INVALID_RESET_CODE') {
      await recordSecurityEvent(email.toLowerCase(), 'password_reset_failed', error.code);
    }
    sendPasswordResetFailure(response, error);
  }
};

module.exports = { confirmPasswordResetCode, requestPasswordResetCode };
