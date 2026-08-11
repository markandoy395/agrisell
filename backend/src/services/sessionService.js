const crypto = require('node:crypto');
const { config } = require('../config/environment');
const { safeCompare } = require('./passwordService');

const ADMIN_ROLE = 'admin';
const ADMIN_PERMISSIONS = ['admin:read', 'admin:write'];
const SUPER_ADMIN_PERMISSIONS = [...ADMIN_PERMISSIONS, 'admin:manage'];

const encodePayload = (payload) =>
  Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');

const decodePayload = (value) =>
  JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));

const sign = (value) =>
  crypto
    .createHmac('sha256', config.sessionSecret)
    .update(value)
    .digest('base64url');

const getPermissionsForAdminRole = (role) =>
  role === 'super_admin' ? SUPER_ADMIN_PERMISSIONS : ADMIN_PERMISSIONS;

const getPublicAdmin = (admin) => ({
  email: admin.email,
  permissions: Array.isArray(admin.permissions)
    ? admin.permissions
    : ADMIN_PERMISSIONS,
  role: ADMIN_ROLE,
});

const createAdminSession = (admin) => {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    exp: now + config.sessionTtlSeconds,
    iat: now,
    jti: crypto.randomUUID(),
    permissions: getPublicAdmin(admin).permissions,
    role: ADMIN_ROLE,
    sub: admin.email,
  };
  const encodedPayload = encodePayload(payload);

  return `${encodedPayload}.${sign(encodedPayload)}`;
};

const verifyAdminSession = (token) => {
  if (typeof token !== 'string') return null;

  const [encodedPayload, signature, extra] = token.split('.');

  if (!encodedPayload || !signature || extra) return null;

  if (!safeCompare(sign(encodedPayload), signature)) {
    return null;
  }

  try {
    const payload = decodePayload(encodedPayload);
    const now = Math.floor(Date.now() / 1000);

    if (
      typeof payload.sub !== 'string' ||
      payload.role !== ADMIN_ROLE ||
      typeof payload.exp !== 'number' ||
      !Array.isArray(payload.permissions) ||
      !payload.permissions.every((permission) => typeof permission === 'string') ||
      payload.exp <= now
    ) {
      return null;
    }

    return getPublicAdmin({ email: payload.sub, permissions: payload.permissions });
  } catch {
    return null;
  }
};

module.exports = {
  ADMIN_PERMISSIONS,
  ADMIN_ROLE,
  SUPER_ADMIN_PERMISSIONS,
  createAdminSession,
  getPermissionsForAdminRole,
  getPublicAdmin,
  verifyAdminSession,
};
