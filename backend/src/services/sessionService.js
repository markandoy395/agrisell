const crypto = require('node:crypto');
const { config, normalizeEmail } = require('../config/environment');
const {
  getSupabaseRows,
  insertSupabaseRow,
  requestSupabase,
  signSupabaseProfileImage,
  updateSupabaseRows,
} = require('./supabaseService');
const {
  ADMIN_ROLES,
  ROLES,
  isAdminRole,
  isValidRole,
} = require('../config/roles');
const { safeCompare } = require('./passwordService');

const ADMIN_ROLE = ROLES.ADMIN;
const ADMIN_PERMISSIONS = [
  'overview:view', 'users:manage', 'farmers:manage', 'logistics:manage',
  'orders:manage', 'payments:view', 'payments:manage', 'sales:manage',
  'reviews:manage', 'support:manage', 'settings:manage',
];
const DEFAULT_ADMIN_PERMISSIONS = ['overview:view', 'users:manage', 'farmers:manage', 'support:manage'];
const SUPER_ADMIN_PERMISSIONS = [...ADMIN_PERMISSIONS, 'admin:manage'];
const localSessions = new Map();
const localSessionVersions = new Map();

const encodePayload = (payload) =>
  Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
const decodePayload = (value) =>
  JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
const sign = (value) => crypto.createHmac('sha256', config.sessionSecret)
  .update(value).digest('base64url');

const normalizeAdminPermissions = (permissions) => {
  const selected = Array.isArray(permissions)
    ? [...new Set(permissions)].filter((permission) => ADMIN_PERMISSIONS.includes(permission))
    : [];
  return selected.length ? selected : DEFAULT_ADMIN_PERMISSIONS;
};

const getPermissionsForAdminRole = (role, permissions) =>
  role === 'super_admin' ? SUPER_ADMIN_PERMISSIONS : normalizeAdminPermissions(permissions);

const getPublicAdmin = (admin) => {
  const supplied = Array.isArray(admin.permissions) ? admin.permissions : [];
  const legacy = supplied.some((permission) =>
    permission === 'admin:read' || permission === 'admin:write');
  const permissions = supplied.includes('admin:manage')
    ? SUPER_ADMIN_PERMISSIONS
    : legacy ? DEFAULT_ADMIN_PERMISSIONS : normalizeAdminPermissions(supplied);
  const email = normalizeEmail(String(admin.email ?? ''));
  const emailName = email.split('@')[0].replace(/[._-]+/g, ' ').trim();
  const role = admin.role === 'super_admin' ? 'super_admin' : ADMIN_ROLE;
  return {
    avatarUrl: typeof admin.avatarUrl === 'string' && admin.avatarUrl.trim()
      ? admin.avatarUrl.trim() : undefined,
    email,
    name: typeof admin.name === 'string' && admin.name.trim()
      ? admin.name.trim()
      : emailName.replace(/\b\w/g, (letter) => letter.toUpperCase()) || 'Administrator',
    permissions,
    role,
  };
};

const permissionsFromRole = (admin, roleRecord) => {
  if (Array.isArray(admin?.permissions)) return admin.permissions;
  const description = String(roleRecord?.description ?? '').trim();
  if (!description.toLowerCase().startsWith('privileges:')) return undefined;
  return description.slice('privileges:'.length).split(',')
    .map((permission) => permission.trim()).filter(Boolean);
};

const loadCurrentAdmin = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  const users = await getSupabaseRows('users', { email: `eq.${normalizedEmail}` });
  const user = users.sort((current, next) =>
    Number(next.user_id ?? 0) - Number(current.user_id ?? 0))[0];
  if (!user || String(user.account_status ?? '').trim().toLowerCase() !== 'active') return null;
  const userId = String(user.user_id ?? '');
  const admins = await getSupabaseRows('admins', { user_id: `eq.${userId}` });
  const administrator = admins.length === 1 ? admins[0] : null;
  const storedRole = String(administrator?.admin_role ?? '').trim().toLowerCase();
  if (!administrator || !['admin', 'super_admin'].includes(storedRole)) return null;
  const roles = await getSupabaseRows('admin_roles', { user_id: `eq.${userId}` });
  return {
    ...getPublicAdmin({
      avatarUrl: await signSupabaseProfileImage(user.profile_photo_url),
      email: normalizedEmail,
      name: [user.first_name, user.middle_name, user.last_name, user.extension_name]
        .map((value) => String(value ?? '').trim()).filter(Boolean).join(' '),
      permissions: getPermissionsForAdminRole(
        storedRole, permissionsFromRole(administrator, roles[0]),
      ),
      role: storedRole,
    }),
    sessionVersion: Number(administrator.session_version) || 1,
    userId,
  };
};

const readSignedSession = (token) => {
  if (typeof token !== 'string') return null;
  const [encodedPayload, signature, extra] = token.split('.');
  if (!encodedPayload || !signature || extra || !safeCompare(sign(encodedPayload), signature)) {
    return null;
  }
  try {
    const payload = decodePayload(encodedPayload);
    const now = Math.floor(Date.now() / 1000);
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.role !== 'string' ||
      !isValidRole(payload.role) ||
      typeof payload.jti !== 'string' || typeof payload.iat !== 'number' ||
      typeof payload.exp !== 'number' || typeof payload.ver !== 'number' ||
      payload.exp <= now
    ) return null;
    return payload;
  } catch {
    return null;
  }
};

const createAdminSession = async (admin) => {
  const normalizedEmail = normalizeEmail(admin.email);
  const current = config.hasSupabaseAdminAccess
    ? await loadCurrentAdmin(normalizedEmail)
    : {
      ...getPublicAdmin(admin),
      sessionVersion: localSessionVersions.get(normalizedEmail) ?? 1,
    };
  if (!current) throw new Error('The administrator account is not active.');
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    exp: now + config.sessionTtlSeconds,
    iat: now,
    jti: crypto.randomUUID(),
    role: current.role || ADMIN_ROLE,
    sub: current.email,
    ver: current.sessionVersion,
  };
  if (config.hasSupabaseAdminAccess) {
    await insertSupabaseRow('admin_sessions', {
      admin_email: current.email,
      admin_user_id: current.userId,
      expires_at: new Date(payload.exp * 1_000).toISOString(),
      issued_at: new Date(payload.iat * 1_000).toISOString(),
      session_id: payload.jti,
      session_version: payload.ver,
    });
  } else {
    localSessions.set(payload.jti, { admin: current, ...payload });
  }
  const encodedPayload = encodePayload(payload);
  return `${encodedPayload}.${sign(encodedPayload)}`;
};

const createUserSession = async (user) => {
  const normalizedEmail = normalizeEmail(user.email);
  const now = Math.floor(Date.now() / 1000);
  const role = user.role || ROLES.USER;
  const payload = {
    exp: now + config.sessionTtlSeconds,
    iat: now,
    jti: crypto.randomUUID(),
    role,
    sub: normalizedEmail,
    ver: 1,
  };
  const userData = {
    email: normalizedEmail,
    name: user.name || normalizedEmail.split('@')[0],
    permissions: [],
    role,
    userId: user.userId || user.user_id,
  };
  if (config.hasSupabaseAdminAccess) {
    await insertSupabaseRow('admin_sessions', {
      admin_email: normalizedEmail,
      admin_user_id: userData.userId || 'user-unknown',
      expires_at: new Date(payload.exp * 1_000).toISOString(),
      issued_at: new Date(payload.iat * 1_000).toISOString(),
      session_id: payload.jti,
      session_version: payload.ver,
    }).catch(() => null);
  } else {
    localSessions.set(payload.jti, { user: userData, ...payload });
  }
  const encodedPayload = encodePayload(payload);
  return `${encodedPayload}.${sign(encodedPayload)}`;
};

const createSession = async (account, role = ROLES.ADMIN) => {
  if (isAdminRole(role)) {
    return createAdminSession({ ...account, role });
  }
  return createUserSession({ ...account, role });
};

const verifySession = async (token) => {
  const payload = readSignedSession(token);
  if (!payload) return null;

  if (!config.hasSupabaseAdminAccess) {
    const stored = localSessions.get(payload.jti);
    if (!stored || stored.sub !== payload.sub || stored.exp !== payload.exp ||
      stored.ver !== payload.ver) {
      return null;
    }
    if (!isAdminRole(payload.role)) {
      return {
        email: stored.user?.email || stored.sub,
        name: stored.user?.name || 'User',
        permissions: [],
        role: payload.role,
        session: { expiresAt: payload.exp, id: payload.jti, issuedAt: payload.iat },
        userId: stored.user?.userId,
      };
    }
    if ((localSessionVersions.get(payload.sub) ?? 1) !== payload.ver) {
      return null;
    }
    return {
      ...getPublicAdmin(stored.admin || stored),
      session: { expiresAt: payload.exp, id: payload.jti, issuedAt: payload.iat },
    };
  }

  if (isAdminRole(payload.role)) {
    const rows = await getSupabaseRows('admin_sessions', { session_id: `eq.${payload.jti}` });
    const stored = rows.length === 1 ? rows[0] : null;
    if (!stored || stored.revoked_at || normalizeEmail(String(stored.admin_email ?? '')) !==
        normalizeEmail(payload.sub) || Number(stored.session_version) !== payload.ver ||
        new Date(String(stored.expires_at)).getTime() <= Date.now()) return null;
    const current = await loadCurrentAdmin(payload.sub);
    if (!current || current.sessionVersion !== payload.ver) return null;
    return {
      ...getPublicAdmin(current),
      session: { expiresAt: payload.exp, id: payload.jti, issuedAt: payload.iat },
    };
  }

  const users = await getSupabaseRows('users', { email: `eq.${normalizeEmail(payload.sub)}` });
  const user = users[0];
  if (!user || String(user.account_status ?? '').trim().toLowerCase() !== 'active') return null;
  return {
    email: normalizeEmail(payload.sub),
    name: [user.first_name, user.last_name].filter(Boolean).join(' ') || 'User',
    permissions: [],
    role: payload.role,
    session: { expiresAt: payload.exp, id: payload.jti, issuedAt: payload.iat },
    userId: String(user.user_id ?? ''),
  };
};

const verifyAdminSession = async (token) => {
  const session = await verifySession(token);
  if (!session || !isAdminRole(session.role)) return null;
  return session;
};

const getAdminSessions = async (email, currentSessionId) => {
  const now = Date.now();
  const normalizedEmail = normalizeEmail(email);
  if (!config.hasSupabaseAdminAccess) {
    return [...localSessions.entries()].flatMap(([id, session]) =>
      session.sub === normalizedEmail && session.exp * 1_000 > now
        ? [{
          current: id === currentSessionId,
          email: session.sub,
          expiresAt: session.exp,
          id,
          issuedAt: session.iat,
        }] : []);
  }
  const rows = await getSupabaseRows('admin_sessions', {
    admin_email: `eq.${normalizedEmail}`,
    limit: '100',
    order: 'issued_at.desc',
    revoked_at: 'is.null',
  });
  return rows.filter((row) => new Date(String(row.expires_at)).getTime() > now)
    .map((row) => ({
      current: row.session_id === currentSessionId,
      email: row.admin_email,
      expiresAt: Math.floor(new Date(String(row.expires_at)).getTime() / 1_000),
      id: row.session_id,
      issuedAt: Math.floor(new Date(String(row.issued_at)).getTime() / 1_000),
    }));
};

const revokeAdminSession = async (sessionId) => {
  if (!sessionId) return false;
  if (!config.hasSupabaseAdminAccess) return localSessions.delete(sessionId);
  const rows = await updateSupabaseRows(
    'admin_sessions', { session_id: `eq.${sessionId}`, revoked_at: 'is.null' },
    { revoked_at: new Date().toISOString() },
  );
  return rows.length > 0;
};

const revokeAdminSessions = async (email, exceptSessionId) => {
  const normalizedEmail = normalizeEmail(email);
  if (!config.hasSupabaseAdminAccess) {
    let revoked = 0;
    localSessions.forEach((session, id) => {
      if (session.sub === normalizedEmail && id !== exceptSessionId) {
        localSessions.delete(id);
        revoked += 1;
      }
    });
    return revoked;
  }
  const filters = { admin_email: `eq.${normalizedEmail}`, revoked_at: 'is.null' };
  if (exceptSessionId) filters.session_id = `neq.${exceptSessionId}`;
  return (await updateSupabaseRows(
    'admin_sessions', filters, { revoked_at: new Date().toISOString() },
  )).length;
};

const invalidateAdminSessions = async (email) => {
  const normalizedEmail = normalizeEmail(email);
  if (!config.hasSupabaseAdminAccess) {
    localSessionVersions.set(normalizedEmail, (localSessionVersions.get(normalizedEmail) ?? 1) + 1);
    return revokeAdminSessions(normalizedEmail);
  }
  const result = await requestSupabase(
    new URL('/rest/v1/rpc/admin_invalidate_sessions', config.supabaseUrl),
    {
      body: JSON.stringify({ p_email: normalizedEmail }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
  );
  const row = Array.isArray(result) ? result[0] : result;
  return Number(row?.revoked_sessions) || 0;
};

module.exports = {
  ADMIN_PERMISSIONS,
  ADMIN_ROLE,
  ADMIN_ROLES,
  DEFAULT_ADMIN_PERMISSIONS,
  ROLES,
  SUPER_ADMIN_PERMISSIONS,
  createAdminSession,
  createSession,
  createUserSession,
  getAdminSessions,
  getPermissionsForAdminRole,
  getPublicAdmin,
  invalidateAdminSessions,
  isAdminRole,
  revokeAdminSession,
  revokeAdminSessions,
  verifyAdminSession,
  verifySession,
};
