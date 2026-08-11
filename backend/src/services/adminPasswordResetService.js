const { config, normalizeEmail } = require('../config/environment');
const { SupabaseRequestError, requestSupabaseAuth } = require('./supabaseService');
const { isSupabaseAdminEmail } = require('./supabaseAdminAuthService');

class AdminPasswordResetError extends Error {
  constructor(code, message, statusCode) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

const isRecord = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getText = (value) => (typeof value === 'string' ? value.trim() : '');

const requireSupabaseAdminAccess = () => {
  if (!config.hasSupabaseAdminAccess) {
    throw new AdminPasswordResetError(
      'PASSWORD_RESET_NOT_CONFIGURED',
      'Password recovery is not configured on this server.',
      503,
    );
  }
};

const requestAdminPasswordReset = async (email) => {
  requireSupabaseAdminAccess();

  const normalizedEmail = normalizeEmail(email);
  const isAdmin = await isSupabaseAdminEmail(normalizedEmail);

  if (!isAdmin) return;

  await requestSupabaseAuth('/auth/v1/recover', {
    body: JSON.stringify({ email: normalizedEmail }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
};

const verifyRecoveryCode = async ({ code, email }) => {
  try {
    const verification = await requestSupabaseAuth('/auth/v1/verify', {
      body: JSON.stringify({
        email: normalizeEmail(email),
        token: code,
        type: 'recovery',
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    const accessToken = isRecord(verification)
      ? getText(verification.access_token)
      : '';

    if (!accessToken) {
      throw new AdminPasswordResetError(
        'INVALID_RESET_CODE',
        'The recovery code is invalid or has expired.',
        400,
      );
    }

    return accessToken;
  } catch (error) {
    if (error instanceof AdminPasswordResetError) throw error;

    if (error instanceof SupabaseRequestError && error.status === 400) {
      throw new AdminPasswordResetError(
        'INVALID_RESET_CODE',
        'The recovery code is invalid or has expired.',
        400,
      );
    }

    throw error;
  }
};

const resetAdminPasswordWithCode = async ({ code, email, password }) => {
  requireSupabaseAdminAccess();

  const normalizedEmail = normalizeEmail(email);
  const isAdmin = await isSupabaseAdminEmail(normalizedEmail);

  if (!isAdmin) {
    throw new AdminPasswordResetError(
      'INVALID_RESET_CODE',
      'The recovery code is invalid or has expired.',
      400,
    );
  }

  const accessToken = await verifyRecoveryCode({ code, email: normalizedEmail });

  await requestSupabaseAuth('/auth/v1/user', {
    body: JSON.stringify({ password }),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    method: 'PUT',
  });
};

module.exports = {
  AdminPasswordResetError,
  requestAdminPasswordReset,
  resetAdminPasswordWithCode,
};
