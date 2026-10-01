import { ADMIN_PERMISSIONS } from "../config.ts";
import { getTable, requestSupabase, updateRows } from "../repository.ts";
import type { Admin, Row } from "../types.ts";
import { createApiError, id, number, text } from "../value.ts";
import { getAuthUserByEmail } from "./authUsers.ts";
import { invalidateNodeSessions } from "./sessions.ts";

const permissionsFromPayload = (body: Row) => {
  const source = Array.isArray(body.permissions) ? body.permissions : [];
  const permissions = [...new Set(source.filter((item): item is string =>
    typeof item === "string" && ADMIN_PERMISSIONS.includes(item)))];
  if (!permissions.length || permissions.length !== new Set(source).size) {
    throw createApiError(
      "INVALID_ADMIN_PRIVILEGES", "Select at least one valid administrator privilege.",
    );
  }
  return permissions;
};

const newestUser = (users: Row[]) => [...users].sort((current, next) =>
  number(next.user_id) - number(current.user_id))[0];

export const createAdministrator = async (payload: unknown, assigningAdmin: Admin) => {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw createApiError("INVALID_ADMIN_PAYLOAD", "Enter the new administrator details.");
  }
  const body = payload as Row;
  const email = text(body.email).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const firstName = text(body.firstName);
  const lastName = text(body.lastName);
  const permissions = permissionsFromPayload(body);
  if (!firstName || !lastName || firstName.length > 100 || lastName.length > 100) {
    throw createApiError("INVALID_ADMIN_PAYLOAD", "First and last names are required.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw createApiError("INVALID_ADMIN_PAYLOAD", "Enter a valid email address.");
  }
  if (password.length < 8 || password.length > 512) {
    throw createApiError(
      "INVALID_ADMIN_PAYLOAD", "Password must be between 8 and 512 characters.",
    );
  }
  let authUser = await getAuthUserByEmail(email);
  const resumedAuthUser = Boolean(authUser);
  if (authUser && text((authUser.user_metadata as Row | undefined)?.requested_role) !== "admin") {
    throw createApiError(
      "ADMIN_ALREADY_EXISTS", "An account already uses this email address.", 409,
    );
  }
  if (!authUser) {
    const result = await requestSupabase("/auth/v1/admin/users", {
      body: JSON.stringify({
        email, email_confirm: true, password,
        user_metadata: { first_name: firstName, last_name: lastName, requested_role: "admin" },
      }),
      headers: { "Content-Type": "application/json" }, method: "POST",
    }) as Row;
    authUser = (typeof result.user === "object" && result.user !== null
      ? result.user : result) as Row;
  }
  const authUserId = text(authUser.id);
  if (!authUserId) {
    throw createApiError(
      "ADMIN_CREATION_FAILED", "Supabase did not return the new authentication user.", 502,
    );
  }
  try {
    const applicationUser = newestUser(await getTable("users", { email: `eq.${email}` }));
    const userId = id(applicationUser?.user_id);
    if (!userId) {
      throw createApiError(
        "ADMIN_PROFILE_NOT_CREATED", "The administrator profile was not created.", 502,
      );
    }
    if ((await getTable("admins", { user_id: `eq.${userId}` })).length) {
      throw createApiError(
        "ADMIN_ALREADY_EXISTS", "This administrator account is already configured.", 409,
      );
    }
    if (resumedAuthUser) {
      await requestSupabase(`/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, {
        body: JSON.stringify({ password }), headers: { "Content-Type": "application/json" },
        method: "PUT",
      });
    }
    await updateRows("users", `user_id=eq.${encodeURIComponent(userId)}`, {
      account_status: "active", first_name: firstName, last_name: lastName,
    });
    await requestSupabase("/rest/v1/admins", {
      body: JSON.stringify({
        admin_code: "AGRI-ADMIN", admin_role: "admin",
        assigned_by_user_id: assigningAdmin.userId,
        date_assigned: new Date().toISOString(), user_id: userId,
      }),
      headers: { "Content-Type": "application/json" }, method: "POST",
    });
    await requestSupabase("/rest/v1/admin_roles", {
      body: JSON.stringify({
        description: `Privileges: ${permissions.join(", ")}`,
        role_level: 50, role_name: "Administrator", user_id: userId,
      }),
      headers: { "Content-Type": "application/json" }, method: "POST",
    });
    return { email, permissions, userId };
  } catch (error) {
    await requestSupabase(`/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, {
      method: "DELETE",
    }).catch(() => undefined);
    throw error;
  }
};

export const updateAdministratorPrivileges = async (userId: string, payload: unknown) => {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw createApiError(
      "INVALID_ADMIN_PRIVILEGES", "Select at least one valid administrator privilege.",
    );
  }
  const permissions = permissionsFromPayload(payload as Row);
  const targetAdmin = (await getTable("admins", { user_id: `eq.${userId}` }))[0];
  const targetRole = text(targetAdmin?.admin_role).toLowerCase();
  if (targetRole === "super_admin") {
    throw createApiError(
      "SUPER_ADMIN_IMMUTABLE", "Superadmin privileges cannot be restricted.", 403,
    );
  }
  if (targetRole !== "admin") {
    throw createApiError(
      "ADMIN_NOT_FOUND", "The administrator account could not be found.", 404,
    );
  }
  const description = `Privileges: ${permissions.join(", ")}`;
  const updated = await updateRows(
    "admin_roles", `user_id=eq.${encodeURIComponent(userId)}`, { description },
  );
  if (!updated.length) {
    await requestSupabase("/rest/v1/admin_roles", {
      body: JSON.stringify({
        description, role_level: 50, role_name: "Administrator", user_id: userId,
      }),
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      method: "POST",
    });
  }
  const users = await getTable("users", { user_id: `eq.${userId}` });
  const targetEmail = text(users[0]?.email).toLowerCase();
  if (targetEmail) await invalidateNodeSessions(targetEmail);
  return { permissions, userId };
};
