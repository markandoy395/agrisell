const assert = require('node:assert/strict');
const test = require('node:test');
const { config } = require('../config/environment');
const {
  clearLocalRateLimits,
  consumeDistributedRateLimit,
  hashRateLimitKey,
} = require('./rateLimitService');

test('hashes limiter identifiers without retaining raw account or IP values', () => {
  const hash = hashRateLimitKey('admin@example.com');
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(hash.includes('admin'), false);
});

test('local development fallback enforces the configured allowance', async () => {
  const original = config.hasSupabaseAdminAccess;
  config.hasSupabaseAdminAccess = false;
  clearLocalRateLimits();
  try {
    const policy = { key: '127.0.0.1', limit: 2, scope: 'test', windowSeconds: 60 };
    assert.equal((await consumeDistributedRateLimit(policy)).allowed, true);
    assert.equal((await consumeDistributedRateLimit(policy)).allowed, true);
    const rejected = await consumeDistributedRateLimit(policy);
    assert.equal(rejected.allowed, false);
    assert.ok(rejected.retryAfterSeconds > 0);
  } finally {
    clearLocalRateLimits();
    config.hasSupabaseAdminAccess = original;
  }
});
