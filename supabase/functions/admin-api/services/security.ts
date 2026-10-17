import { SERVICE_ROLE_KEY, SUPABASE_URL } from "../config.ts";
import { getTable, insertRow, requestSupabase, updateRows } from "../repository.ts";
import type { Admin, Row } from "../types.ts";
import { createApiError, id, text } from "../value.ts";
import { getAuthUserByEmail } from "./authUsers.ts";
import { invalidateNodeSessions } from "./sessions.ts";

const bearer = (request: Request) => (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();

const tokenClaims = (accessToken: string) => {
  const value = accessToken.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/") ?? "";
  return JSON.parse(atob(value.padEnd(Math.ceil(value.length / 4) * 4, "="))) as Row;
};

export const recordSecurityEvent = async (email: string, action: string, detail = "") => {
  try {
    await insertRow("admin_security_events", {
      action, actor_email: email, detail: detail.slice(0, 500),
    });
  } catch (error) {
    console.warn("Unable to record administrator security activity", error);
  }
};

export const securityOverview = async (request: Request, admin: Admin) => {
  const token = bearer(request);
  let issuedAt = new Date().toISOString();
  let expiresAt = issuedAt;
  let sessionId = "current";
  try {
    const claims = tokenClaims(token);
    issuedAt = new Date(Number(claims.iat) * 1000).toISOString();
    expiresAt = new Date(Number(claims.exp) * 1000).toISOString();
    sessionId = text(claims.session_id, "current");
  } catch { /* valid tokens have already been checked by getAdmin */ }
  const authResult = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
  });
  const authUser = await authResult.json().catch(() => ({})) as Row;
  const factors = Array.isArray(authUser.factors) ? authUser.factors as Row[] : [];
  const verifiedFactor = factors.find((factor) => text(factor.status) === "verified");
  const events = await getTable("admin_security_events", admin.permissions.includes("admin:manage")
    ? { order: "created_at.desc", limit: "100" }
    : { actor_email: `eq.${admin.email}`, order: "created_at.desc", limit: "100" });
  return {
    events: events.map((event) => ({
      action: text(event.action), actorEmail: text(event.actor_email),
      createdAt: text(event.created_at), detail: text(event.detail), id: id(event.event_id),
    })),
    mfaAvailable: true,
    mfaEnabled: Boolean(verifiedFactor),
    mfaFactorId: text(verifiedFactor?.id) || null,
    sessions: [{ current: true, expiresAt, id: sessionId, issuedAt }],
  };
};

export const changePassword = async (request: Request, admin: Admin, body: Row) => {
  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  if (newPassword.length < 12 || newPassword.length > 512 || currentPassword.length > 512) {
    throw createApiError("INVALID_PASSWORD", "Use a new password of at least 12 characters.");
  }
  const verify = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    body: JSON.stringify({ email: admin.email, password: currentPassword }),
    headers: { apikey: SERVICE_ROLE_KEY, "Content-Type": "application/json" }, method: "POST",
  });
  if (!verify.ok) throw createApiError("CURRENT_PASSWORD_INVALID", "The current password is incorrect.", 401);
  const authUser = await getAuthUserByEmail(admin.email);
  const authUserId = text(authUser?.id);
  if (!authUserId) throw createApiError("ADMIN_NOT_FOUND", "Administrator account not found.", 404);
  await invalidateNodeSessions(admin.email);
  await requestSupabase(`/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, {
    body: JSON.stringify({ password: newPassword }),
    headers: { "Content-Type": "application/json" }, method: "PUT",
  });
  await recordSecurityEvent(admin.email, "password_changed", "Administrator password changed.");
  return { changed: true };
};

export const submitAdminRequest = async (admin: Admin, body: Row) => {
  const type = body.type === "feature" ? "feature" : body.type === "support" ? "support" : "";
  const subject = text(body.subject);
  const message = text(body.message);
  if (!type || !subject || !message || subject.length > 160 || message.length > 5000) {
    throw createApiError("INVALID_REQUEST", "Enter a subject and message before submitting.");
  }
  const saved = await insertRow("admin_requests", {
    message, request_type: type, status: "open", subject, submitted_by_email: admin.email,
  });
  await recordSecurityEvent(admin.email, `${type}_submitted`, subject);
  return { id: id(saved.request_id), status: "open" };
};

export const setAdministratorEnabled = async (admin: Admin, userId: string, body: Row) => {
  if (typeof body.enabled !== "boolean") {
    throw createApiError("INVALID_STATUS", "Choose whether the administrator is enabled.");
  }
  if (userId === admin.userId) throw createApiError("CANNOT_DISABLE_SELF", "You cannot disable your own administrator account.", 409);
  const target = (await getTable("admins", { user_id: `eq.${userId}` }))[0];
  const role = text(target?.admin_role).toLowerCase();
  if (role === "super_admin") throw createApiError("ADMIN_STATUS_NOT_EDITABLE", "The super administrator cannot be disabled.", 403);
  if (role !== "admin") throw createApiError("ADMIN_NOT_FOUND", "Administrator not found.", 404);
  const targetUser = (await getTable("users", { user_id: `eq.${userId}` }))[0];
  await updateRows("users", `user_id=eq.${encodeURIComponent(userId)}`, {
    account_status: body.enabled ? "active" : "disabled", updated_at: new Date().toISOString(),
  });
  await invalidateNodeSessions(text(targetUser?.email));
  await recordSecurityEvent(admin.email, body.enabled ? "administrator_enabled" : "administrator_disabled", text(targetUser?.email));
  return { enabled: body.enabled, userId };
};

export const revokeOtherSessions = async (request: Request, admin: Admin) => {
  const result = await fetch(`${SUPABASE_URL}/auth/v1/logout?scope=others`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${bearer(request)}` }, method: "POST",
  });
  if (!result.ok) throw createApiError("SESSION_REVOCATION_FAILED", "Other sessions could not be signed out.", 502);
  await invalidateNodeSessions(admin.email);
  await recordSecurityEvent(admin.email, "sessions_revoked", "Other sessions revoked.");
  return { revoked: true };
};

export const enrollMfa = async (request: Request, _admin: Admin) => {
  const token = bearer(request);
  if (!token) throw createApiError("AUTHENTICATION_REQUIRED", "Sign in again before changing MFA.", 401);
  const response = await fetch(`${SUPABASE_URL}/auth/v1/factors`, {
    body: JSON.stringify({ factor_type: "totp", friendly_name: "Agrisell Admin" }),
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const body = await response.json().catch(() => ({})) as Row;
  if (!response.ok || !text(body.id) || typeof body.totp !== "object" || body.totp === null) {
    throw createApiError("MFA_ENROLLMENT_FAILED", text(body.msg, text(body.message, "MFA enrollment could not be started.")), response.status || 500);
  }
  const totp = body.totp as Row;
  return {
    factorId: text(body.id),
    qrCode: text(totp.qr_code),
    secret: text(totp.secret),
  };
};

export const verifyMfa = async (request: Request, admin: Admin, payload: Row) => {
  const token = bearer(request);
  if (!token) throw createApiError("AUTHENTICATION_REQUIRED", "Sign in again before changing MFA.", 401);
  const factorId = text(payload.factorId);
  const code = text(payload.code).trim();
  if (!factorId || !code) {
    throw createApiError("INVALID_MFA_PAYLOAD", "Factor ID and verification code are required.", 400);
  }
  const challengeResponse = await fetch(`${SUPABASE_URL}/auth/v1/factors/${encodeURIComponent(factorId)}/challenge`, {
    body: "{}",
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const challenge = await challengeResponse.json().catch(() => ({})) as Row;
  const challengeId = text(challenge.id);
  if (!challengeResponse.ok || !challengeId) {
    throw createApiError("MFA_CHALLENGE_FAILED", "MFA verification challenge could not be created.", challengeResponse.status || 500);
  }
  const verifyResponse = await fetch(`${SUPABASE_URL}/auth/v1/factors/${encodeURIComponent(factorId)}/verify`, {
    body: JSON.stringify({ challenge_id: challengeId, code }),
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });
  const verified = await verifyResponse.json().catch(() => ({})) as Row;
  if (!verifyResponse.ok) {
    throw createApiError("INVALID_MFA_CODE", text(verified.msg, text(verified.message, "The authentication code is invalid.")), verifyResponse.status || 401);
  }
  await recordSecurityEvent(admin.email, "mfa_enabled", "Two-factor authentication enabled.");
  return { accessToken: text(verified.access_token), success: true };
};

export const unenrollMfa = async (request: Request, admin: Admin, factorId: string) => {
  const token = bearer(request);
  if (!token) throw createApiError("AUTHENTICATION_REQUIRED", "Sign in again before changing MFA.", 401);
  const response = await fetch(`${SUPABASE_URL}/auth/v1/factors/${encodeURIComponent(factorId)}`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${token}`,
    },
    method: "DELETE",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as Row;
    throw createApiError("MFA_REMOVAL_FAILED", text(body.msg, text(body.message, "MFA could not be removed.")), response.status || 500);
  }
  await recordSecurityEvent(admin.email, "mfa_disabled", "Two-factor authentication disabled.");
  return { success: true };
};
