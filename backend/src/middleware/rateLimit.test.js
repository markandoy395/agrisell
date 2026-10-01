const assert = require('node:assert/strict');
const test = require('node:test');
const { config } = require('../config/environment');
const { clearLocalRateLimits } = require('../services/rateLimitService');
const { enforceAuthenticationRateLimit, getRequestIp } = require('./rateLimit');

test('does not trust spoofable forwarding headers by default', () => {
  const original = config.rateLimitTrustProxyHops;
  config.rateLimitTrustProxyHops = 0;
  try {
    assert.equal(getRequestIp({
      headers: { 'x-forwarded-for': '198.51.100.10' },
      socket: { remoteAddress: '::ffff:127.0.0.1' },
    }), '127.0.0.1');
  } finally {
    config.rateLimitTrustProxyHops = original;
  }
});

test('selects the client address behind the configured trusted proxy count', () => {
  const original = config.rateLimitTrustProxyHops;
  config.rateLimitTrustProxyHops = 2;
  try {
    assert.equal(getRequestIp({
      headers: { 'x-forwarded-for': '198.51.100.10, 10.0.0.4' },
      socket: { remoteAddress: '10.0.0.5' },
    }), '198.51.100.10');
  } finally {
    config.rateLimitTrustProxyHops = original;
  }
});

test('authentication account policy returns 429 with a retry interval', async () => {
  const originalSupabase = config.hasSupabaseAdminAccess;
  config.hasSupabaseAdminAccess = false;
  clearLocalRateLimits();
  const request = { headers: {}, socket: { remoteAddress: '127.0.0.1' } };
  const result = {};
  const response = {
    end(body) { result.body = JSON.parse(body); },
    writeHead(statusCode, headers) {
      result.headers = headers;
      result.statusCode = statusCode;
    },
  };
  try {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      assert.equal(await enforceAuthenticationRateLimit(
        request, response, 'login', 'Admin@Example.com',
      ), true);
    }
    assert.equal(await enforceAuthenticationRateLimit(
      request, response, 'login', 'admin@example.com',
    ), false);
    assert.equal(result.statusCode, 429);
    assert.equal(result.body.code, 'RATE_LIMITED');
    assert.ok(Number(result.headers['Retry-After']) > 0);
  } finally {
    clearLocalRateLimits();
    config.hasSupabaseAdminAccess = originalSupabase;
  }
});
