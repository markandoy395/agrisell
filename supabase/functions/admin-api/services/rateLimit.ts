import { requestSupabase } from "../repository.ts";
import type { Admin, HandlerResult, Row } from "../types.ts";

const MUTATION_METHODS = new Set(["DELETE", "PATCH", "POST", "PUT"]);

const hashKey = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const clientIp = (request: Request) => {
  const cloudflare = request.headers.get("cf-connecting-ip")?.trim();
  if (cloudflare) return cloudflare.slice(0, 128);
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || "unknown").slice(0, 128);
};

type Policy = { key: string; limit: number; scope: string; windowSeconds: number };

const AUTH_POLICIES = {
  login: { accountLimit: 5, ipLimit: 20, windowSeconds: 15 * 60 },
  mfa: { accountLimit: 10, ipLimit: 30, windowSeconds: 15 * 60 },
  passwordResetConfirm: { accountLimit: 5, ipLimit: 15, windowSeconds: 15 * 60 },
  passwordResetRequest: { accountLimit: 3, ipLimit: 10, windowSeconds: 60 * 60 },
} as const;

const consume = async (policy: Policy) => {
  const payload = await requestSupabase("/rest/v1/rpc/admin_consume_rate_limit", {
    body: JSON.stringify({
      p_key_hash: await hashKey(policy.key),
      p_limit: policy.limit,
      p_scope: policy.scope,
      p_window_seconds: policy.windowSeconds,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  }) as Row[] | Row;
  const result = Array.isArray(payload) ? payload[0] : payload;
  if (!result || typeof result.allowed !== "boolean") {
    throw new Error("The distributed rate limiter returned an invalid response.");
  }
  return {
    allowed: result.allowed,
    retryAfterSeconds: Math.max(1, Number(result.retry_after_seconds) || 1),
  };
};

export const enforceMutationRateLimit = async (
  request: Request,
  admin: Admin,
): Promise<HandlerResult | null> => {
  if (!MUTATION_METHODS.has(request.method)) return null;
  const policies: Policy[] = [
    {
      key: clientIp(request), limit: 120, scope: "admin:mutation:ip", windowSeconds: 60,
    },
    {
      key: admin.email.toLowerCase(),
      limit: 60,
      scope: "admin:mutation:account",
      windowSeconds: 60,
    },
  ];
  for (const policy of policies) {
    const result = await consume(policy);
    if (!result.allowed) {
      return {
        status: 429,
        body: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please try again later.",
          retryAfterSeconds: result.retryAfterSeconds,
        },
        headers: { "Retry-After": String(result.retryAfterSeconds) },
      };
    }
  }
  return null;
};

export const enforceAuthenticationRateLimit = async (
  request: Request,
  operation: keyof typeof AUTH_POLICIES,
  email: string,
): Promise<HandlerResult | null> => {
  const policy = AUTH_POLICIES[operation];
  const policies: Policy[] = [
    {
      key: clientIp(request),
      limit: policy.ipLimit,
      scope: `auth:${operation}:ip`,
      windowSeconds: policy.windowSeconds,
    },
    {
      key: email.trim().toLowerCase(),
      limit: policy.accountLimit,
      scope: `auth:${operation}:account`,
      windowSeconds: policy.windowSeconds,
    },
  ];
  for (const current of policies) {
    const result = await consume(current);
    if (!result.allowed) {
      return {
        status: 429,
        body: {
          code: "RATE_LIMITED",
          message: "Too many requests. Please try again later.",
          retryAfterSeconds: result.retryAfterSeconds,
        },
        headers: { "Retry-After": String(result.retryAfterSeconds) },
      };
    }
  }
  return null;
};
