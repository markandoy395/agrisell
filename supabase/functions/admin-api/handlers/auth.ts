import { SERVICE_ROLE_KEY, SUPABASE_URL } from "../config.ts";
import { getAdmin } from "../services/auth.ts";
import { enforceAuthenticationRateLimit } from "../services/rateLimit.ts";
import { recordSecurityEvent } from "../services/security.ts";
import type { HandlerResult, Row } from "../types.ts";
import { text } from "../value.ts";

const readLoginBody = async (request: Request) => {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 2_000) return null;
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 2_000) return null;
  try {
    const body = JSON.parse(raw) as unknown;
    return typeof body === "object" && body !== null && !Array.isArray(body)
      ? body as Row : null;
  } catch {
    return null;
  }
};

const authorizedRequest = (request: Request, accessToken: string) => {
  const headers = new Headers(request.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  return new Request(request.url, { headers, method: "GET" });
};

export const handleAuthRoutes = async (
  request: Request,
  pathname: string,
): Promise<HandlerResult | null> => {
  if (pathname === "/api/auth/mfa/verify" && request.method === "POST") {
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
      return {
        status: 415,
        body: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Verification requests must use application/json." },
      };
    }
    const raw = await request.text();
    let body: Row | null = null;
    try {
      body = JSON.parse(raw) as Row;
    } catch {
      body = null;
    }
    const accessToken = text(body?.accessToken);
    const challengeId = text(body?.challengeId);
    const factorId = text(body?.factorId);
    const code = text(body?.code).trim();
    if (!accessToken || !challengeId || !factorId || !code) {
      return {
        status: 400,
        body: { code: "INVALID_MFA_PAYLOAD", message: "A valid authentication code and challenge are required." },
      };
    }
    const limited = await enforceAuthenticationRateLimit(request, "mfa", factorId);
    if (limited) return limited;

    const verifyResponse = await fetch(
      `${SUPABASE_URL}/auth/v1/factors/${encodeURIComponent(factorId)}/verify`,
      {
        body: JSON.stringify({ challenge_id: challengeId, code }),
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );
    const verifyBody = await verifyResponse.json().catch(() => null) as Row | null;
    const newAccessToken = text(verifyBody?.access_token);
    if (!verifyResponse.ok || !newAccessToken) {
      return {
        status: 401,
        body: {
          code: "INVALID_MFA_CODE",
          message: text(verifyBody?.msg, text(verifyBody?.message, "The authentication code is invalid.")),
        },
      };
    }
    const admin = await getAdmin(authorizedRequest(request, newAccessToken));
    if (!admin) {
      await recordSecurityEvent("admin", "sign_in_failed", "ADMIN_PERMISSION_REQUIRED");
      return {
        status: 403,
        body: {
          code: "ADMIN_PERMISSION_REQUIRED",
          message: "This account is not authorized to access the admin platform.",
        },
      };
    }
    await recordSecurityEvent(admin.email, "signed_in", "Administrator signed in with MFA.");
    return { status: 200, body: { accessToken: newAccessToken, admin, authenticated: true } };
  }

  if (pathname !== "/api/auth/login" || request.method !== "POST") return null;
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return {
      status: 415,
      body: { code: "UNSUPPORTED_MEDIA_TYPE", message: "Login requests must use application/json." },
    };
  }
  const body = await readLoginBody(request);
  const email = text(body?.email).toLowerCase();
  const password = typeof body?.password === "string" ? body.password : "";
  if (!email || !email.includes("@") || email.length > 254 || !password || password.length > 512) {
    return {
      status: 400,
      body: { code: "INVALID_LOGIN_PAYLOAD", message: "Enter your admin email and password." },
    };
  }
  const limited = await enforceAuthenticationRateLimit(request, "login", email);
  if (limited) return limited;

  const loginResponse = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    body: JSON.stringify({ email, password }),
    headers: { apikey: SERVICE_ROLE_KEY, "Content-Type": "application/json" },
    method: "POST",
  });
  const login = await loginResponse.json().catch(() => null) as Row | null;
  const accessToken = text(login?.access_token);
  if (!loginResponse.ok || !accessToken) {
    await recordSecurityEvent(email, "sign_in_failed", "INVALID_CREDENTIALS");
    return {
      status: 401,
      body: { code: "INVALID_CREDENTIALS", message: "Invalid admin email or password." },
    };
  }

  const factors = typeof login?.user === "object" && login.user !== null &&
      Array.isArray((login.user as Row).factors)
    ? ((login.user as Row).factors as Row[]).filter((factor) =>
      text(factor.status) === "verified" && Boolean(text(factor.id)))
    : [];
  if (factors.length) {
    const factorId = text(factors[0].id);
    const challengeResponse = await fetch(
      `${SUPABASE_URL}/auth/v1/factors/${encodeURIComponent(factorId)}/challenge`,
      {
        body: "{}",
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        method: "POST",
      },
    );
    const challenge = await challengeResponse.json().catch(() => null) as Row | null;
    if (!challengeResponse.ok || !text(challenge?.id)) {
      return {
        status: 502,
        body: { code: "MFA_CHALLENGE_FAILED", message: "The MFA challenge could not be started." },
      };
    }
    return {
      status: 401,
      body: {
        accessToken,
        challengeId: text(challenge?.id),
        code: "MFA_REQUIRED",
        factorId,
        message: "Enter the code from your authenticator app.",
      },
    };
  }

  const admin = await getAdmin(authorizedRequest(request, accessToken));
  if (!admin) {
    await recordSecurityEvent(email, "sign_in_failed", "ADMIN_PERMISSION_REQUIRED");
    return {
      status: 403,
      body: {
        code: "ADMIN_PERMISSION_REQUIRED",
        message: "This account is not authorized to access the admin platform.",
      },
    };
  }
  await recordSecurityEvent(email, "signed_in", "Administrator signed in.");
  return { status: 200, body: { accessToken, admin, authenticated: true } };
};
