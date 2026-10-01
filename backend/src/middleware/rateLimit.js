const { config, normalizeEmail } = require('../config/environment');
const { consumeDistributedRateLimit } = require('../services/rateLimitService');
const { getHeaderValue, sendJson } = require('../utils/http');

const MUTATION_METHODS = new Set(['DELETE', 'PATCH', 'POST', 'PUT']);

const normalizeAddress = (value) => {
  const address = String(value ?? '').trim();
  if (address.startsWith('::ffff:')) return address.slice(7);
  return address.slice(0, 128) || 'unknown';
};

const getRequestIp = (request) => {
  const remoteAddress = normalizeAddress(request.socket?.remoteAddress);
  if (!config.rateLimitTrustProxyHops) return remoteAddress;
  const forwarded = String(getHeaderValue(request.headers['x-forwarded-for']) ?? '')
    .split(',')
    .map((value) => normalizeAddress(value))
    .filter((value) => value !== 'unknown');
  if (forwarded.length < config.rateLimitTrustProxyHops) return remoteAddress;
  return forwarded[forwarded.length - config.rateLimitTrustProxyHops];
};

const rejectRateLimitedRequest = (response, result) => {
  const retryAfter = Math.max(1, result.retryAfterSeconds);
  sendJson(response, 429, {
    code: 'RATE_LIMITED',
    message: 'Too many requests. Please try again later.',
    retryAfterSeconds: retryAfter,
  }, {
    'Retry-After': String(retryAfter),
  });
};

const enforcePolicies = async (response, policies) => {
  try {
    for (const policy of policies) {
      const result = await consumeDistributedRateLimit(policy);
      if (!result.allowed) {
        rejectRateLimitedRequest(response, result);
        return false;
      }
    }
    return true;
  } catch (error) {
    console.error('Distributed rate limiting is unavailable.', error);
    sendJson(response, 503, {
      code: 'RATE_LIMIT_UNAVAILABLE',
      message: 'Request protection is temporarily unavailable. Please try again.',
    });
    return false;
  }
};

const AUTH_POLICIES = {
  login: { accountLimit: 5, ipLimit: 20, windowSeconds: 15 * 60 },
  passwordResetConfirm: { accountLimit: 5, ipLimit: 15, windowSeconds: 15 * 60 },
  passwordResetRequest: { accountLimit: 3, ipLimit: 10, windowSeconds: 60 * 60 },
};

const enforceAuthenticationRateLimit = (request, response, operation, email) => {
  const policy = AUTH_POLICIES[operation];
  if (!policy) throw new Error(`Unknown authentication rate-limit operation: ${operation}`);
  const normalizedEmail = normalizeEmail(email);
  return enforcePolicies(response, [
    {
      key: getRequestIp(request),
      limit: policy.ipLimit,
      scope: `auth:${operation}:ip`,
      windowSeconds: policy.windowSeconds,
    },
    {
      key: normalizedEmail,
      limit: policy.accountLimit,
      scope: `auth:${operation}:account`,
      windowSeconds: policy.windowSeconds,
    },
  ]);
};

const enforceAuthenticatedMutationRateLimit = (request, response, admin) => {
  if (!MUTATION_METHODS.has(request.method)) return true;
  return enforcePolicies(response, [
    {
      key: getRequestIp(request),
      limit: 120,
      scope: 'admin:mutation:ip',
      windowSeconds: 60,
    },
    {
      key: normalizeEmail(admin.email),
      limit: 60,
      scope: 'admin:mutation:account',
      windowSeconds: 60,
    },
  ]);
};

module.exports = {
  enforceAuthenticatedMutationRateLimit,
  enforceAuthenticationRateLimit,
  getRequestIp,
};
