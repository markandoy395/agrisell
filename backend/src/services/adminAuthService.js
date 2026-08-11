const { config, normalizeEmail } = require('../config/environment');
const { safeCompare, verifyPasswordHash } = require('./passwordService');
const { getPublicAdmin } = require('./sessionService');
const {
  authenticateSupabaseAdminCredentials,
} = require('./supabaseAdminAuthService');

const authenticateAdminCredentials = async (email, password) => {
  if (config.hasSupabaseAdminAccess) {
    return authenticateSupabaseAdminCredentials(
      normalizeEmail(email),
      password,
    );
  }

  if (!config.hasAdminCredentials) {
    return { reason: 'AUTH_NOT_CONFIGURED', success: false };
  }

  const normalizedEmail = normalizeEmail(email);

  if (!safeCompare(normalizedEmail, config.adminEmail)) {
    return { reason: 'INVALID_CREDENTIALS', success: false };
  }

  const passwordMatches = config.adminPasswordHash
    ? await verifyPasswordHash(password, config.adminPasswordHash)
    : safeCompare(password, config.adminPassword);

  if (!passwordMatches) {
    return { reason: 'INVALID_CREDENTIALS', success: false };
  }

  return {
    admin: getPublicAdmin({ email: config.adminEmail }),
    success: true,
  };
};

module.exports = { authenticateAdminCredentials };
