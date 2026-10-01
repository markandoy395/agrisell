const crypto = require('node:crypto');
const { config } = require('../config/environment');
const { requestSupabase } = require('../modules/shared/supabase/supabaseRequest');

const localBuckets = new Map();

const hashRateLimitKey = (value) =>
  crypto.createHash('sha256').update(String(value)).digest('hex');

const consumeLocalRateLimit = ({ keyHash, limit, scope, windowSeconds }) => {
  const now = Date.now();
  const bucketKey = `${scope}:${keyHash}`;
  const current = localBuckets.get(bucketKey);
  const windowMilliseconds = windowSeconds * 1_000;
  const bucket = !current || current.startedAt + windowMilliseconds <= now
    ? { count: 1, startedAt: now }
    : { count: Math.min(current.count + 1, limit + 1), startedAt: current.startedAt };
  localBuckets.set(bucketKey, bucket);
  const retryAfterSeconds = bucket.count <= limit
    ? 0
    : Math.max(1, Math.ceil((bucket.startedAt + windowMilliseconds - now) / 1_000));
  return {
    allowed: bucket.count <= limit,
    remaining: Math.max(0, limit - bucket.count),
    retryAfterSeconds,
  };
};

const consumeDistributedRateLimit = async ({ key, limit, scope, windowSeconds }) => {
  const keyHash = hashRateLimitKey(key);
  if (!config.hasSupabaseAdminAccess) {
    return consumeLocalRateLimit({ keyHash, limit, scope, windowSeconds });
  }
  const body = await requestSupabase(
    new URL('/rest/v1/rpc/admin_consume_rate_limit', config.supabaseUrl),
    {
      body: JSON.stringify({
        p_key_hash: keyHash,
        p_limit: limit,
        p_scope: scope,
        p_window_seconds: windowSeconds,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
  );
  const result = Array.isArray(body) ? body[0] : body;
  if (!result || typeof result.allowed !== 'boolean') {
    throw new Error('The distributed rate limiter returned an invalid response.');
  }
  return {
    allowed: result.allowed,
    remaining: Number(result.remaining) || 0,
    retryAfterSeconds: Number(result.retry_after_seconds) || 0,
  };
};

const clearLocalRateLimits = () => localBuckets.clear();

module.exports = {
  clearLocalRateLimits,
  consumeDistributedRateLimit,
  hashRateLimitKey,
};
