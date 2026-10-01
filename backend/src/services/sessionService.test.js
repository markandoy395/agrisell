const assert = require('node:assert/strict');
const test = require('node:test');
const { config } = require('../config/environment');
const {
  createAdminSession,
  invalidateAdminSessions,
  revokeAdminSession,
  verifyAdminSession,
} = require('./sessionService');

const decodeTokenPayload = (token) => JSON.parse(
  Buffer.from(token.split('.')[0], 'base64url').toString('utf8'),
);

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
