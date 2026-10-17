const assert = require('node:assert/strict');
const test = require('node:test');
const { config } = require('../config/environment');
const {
  ROLES,
  isAdminRole,
  isUserRole,
} = require('../config/roles');
const {
  createAdminSession,
  createUserSession,
  invalidateAdminSessions,
  revokeAdminSession,
  verifyAdminSession,
  verifySession,
} = require('./sessionService');

const decodeTokenPayload = (token) => JSON.parse(
  Buffer.from(token.split('.')[0], 'base64url').toString('utf8'),
);

test('roles distinguish between admin roles and standard user roles', () => {
  assert.equal(isAdminRole(ROLES.ADMIN), true);
  assert.equal(isAdminRole(ROLES.SUPER_ADMIN), true);
  assert.equal(isAdminRole(ROLES.USER), false);
  assert.equal(isAdminRole(ROLES.FARMER), false);
  assert.equal(isAdminRole(ROLES.RIDER), false);

  assert.equal(isUserRole(ROLES.USER), true);
  assert.equal(isUserRole(ROLES.ADMIN), false);
});

test('session tokens omit administrator permissions and require server-side state', async () => {
  const original = config.hasSupabaseAdminAccess;
  config.hasSupabaseAdminAccess = false;
  try {
    const token = await createAdminSession({
      email: 'token-test@example.com',
      name: 'Token Test',
      permissions: ['users:manage'],
    });
    const payload = decodeTokenPayload(token);
    assert.equal(Object.hasOwn(payload, 'permissions'), false);
    assert.equal(Object.hasOwn(payload, 'name'), false);
    assert.equal(typeof payload.ver, 'number');
    assert.deepEqual((await verifyAdminSession(token)).permissions, ['users:manage']);
    await revokeAdminSession(payload.jti);
    assert.equal(await verifyAdminSession(token), null);
  } finally {
    config.hasSupabaseAdminAccess = original;
  }
});

test('user sessions are recognized by verifySession but rejected by verifyAdminSession', async () => {
  const original = config.hasSupabaseAdminAccess;
  config.hasSupabaseAdminAccess = false;
  try {
    const userToken = await createUserSession({
      email: 'buyer@example.com',
      name: 'Buyer User',
      role: ROLES.USER,
      userId: 'usr-123',
    });

    const userPayload = decodeTokenPayload(userToken);
    assert.equal(userPayload.role, 'user');

    // verifyAdminSession MUST reject non-admin roles
    const adminResult = await verifyAdminSession(userToken);
    assert.equal(adminResult, null);

    // verifySession resolves the authenticated user session with role 'user'
    const sessionResult = await verifySession(userToken);
    assert.ok(sessionResult);
    assert.equal(sessionResult.email, 'buyer@example.com');
    assert.equal(sessionResult.role, 'user');
    assert.equal(isAdminRole(sessionResult.role), false);
  } finally {
    config.hasSupabaseAdminAccess = original;
  }
});

test('session-version rotation invalidates every existing session', async () => {
  const original = config.hasSupabaseAdminAccess;
  config.hasSupabaseAdminAccess = false;
  try {
    const admin = {
      email: 'rotation-test@example.com',
      permissions: ['overview:view'],
    };
    const first = await createAdminSession(admin);
    const second = await createAdminSession(admin);
    assert.ok(await verifyAdminSession(first));
    assert.ok(await verifyAdminSession(second));
    assert.equal(await invalidateAdminSessions(admin.email), 2);
    assert.equal(await verifyAdminSession(first), null);
    assert.equal(await verifyAdminSession(second), null);
    assert.ok(await verifyAdminSession(await createAdminSession(admin)));
  } finally {
    config.hasSupabaseAdminAccess = original;
  }
});
