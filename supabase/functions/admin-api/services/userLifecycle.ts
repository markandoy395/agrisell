import type { Admin, Row } from "../types.ts";
import { getTable, insertRow, requestSupabase, updateRows } from "../repository.ts";
import { createApiError, id, text } from "../value.ts";
import { getAuthUserByEmail } from "./authUsers.ts";

const ensureNotAdmin = async (userId: string) => {
  if ((await getTable("admins", { user_id: `eq.${userId}` })).length) {
    throw createApiError(
      "ADMIN_ACCOUNT_PROTECTED",
      "Administrator accounts must be managed from Administrator Management.",
      409,
    );
  }
};

const updateLinkedProfiles = async (authId: string, status: string) => {
  const farmer = (await getTable("farmers", { auth_user_id: `eq.${authId}` }))[0];
  if (farmer) {
    await updateRows("farmers", `farmer_user_id=eq.${encodeURIComponent(id(farmer.farmer_user_id))}`, {
      account_status: status, updated_at: new Date().toISOString(),
    });
  }
  const rider = (await getTable("riders", { auth_id: `eq.${authId}` }))[0];
  if (!rider) return;
  const employment = status === "active" && text(rider.verification_status).toLowerCase() === "verified"
    ? "active" : status === "suspended" ? "suspended" : "inactive";
  await updateRows("riders", `rider_id=eq.${encodeURIComponent(id(rider.rider_id))}`, {
    availability_status: employment === "active" ? rider.availability_status : "offline",
    employment_status: employment, updated_at: new Date().toISOString(),
  });
};

export const updateUserStatus = async (
  userId: string, payload: unknown, admin: Admin,
) => {
  const body = payload as Row | null;
  const status = text(body?.status).toLowerCase();
  const reason = text(body?.reason);
  if (!["active", "suspended", "deactivated"].includes(status)) {
    throw createApiError("INVALID_ACCOUNT_STATUS", "Choose active, suspended, or deactivated.", 400);
  }
  if (status !== "active" && !reason) {
    throw createApiError("REASON_REQUIRED", "A reason is required to restrict an account.", 400);
  }
  const user = (await getTable("users", { user_id: `eq.${userId}` }))[0];
  if (!user) throw createApiError("USER_NOT_FOUND", "The user account could not be found.", 404);
  await ensureNotAdmin(userId);
  const authUser = await getAuthUserByEmail(text(user.email).toLowerCase());
  if (authUser?.id) {
    await requestSupabase(`/auth/v1/admin/users/${encodeURIComponent(id(authUser.id))}`, {
      body: JSON.stringify({ ban_duration: status === "active" ? "none" : "876000h" }),
      headers: { "Content-Type": "application/json" }, method: "PUT",
    });
  }
  const updated = await updateRows("users", `user_id=eq.${encodeURIComponent(userId)}`, {
    account_status: status, updated_at: new Date().toISOString(),
  });
  if (authUser?.id) await updateLinkedProfiles(id(authUser.id), status);
  await insertRow("admin_account_lifecycle_events", {
    account_id: userId, account_type: "user", action: status,
    actor_email: admin.email, previous_status: text(user.account_status) || null,
    reason: reason || null,
  });
  return updated[0];
};

export const updateUserProfile = async (
  userId: string, payload: unknown, admin: Admin,
) => {
  const body = payload as Row | null;
  const firstName = text(body?.firstName);
  const lastName = text(body?.lastName);
  if (!firstName || !lastName || firstName.length > 100 || lastName.length > 100) {
    throw createApiError("INVALID_USER_PROFILE", "First and last name are required.", 400);
  }
  await ensureNotAdmin(userId);
  const updated = await updateRows("users", `user_id=eq.${encodeURIComponent(userId)}`, {
    contact_number: text(body?.contactNumber) || null,
    date_of_birth: text(body?.dateOfBirth) || null,
    extension_name: text(body?.extensionName) || null,
    first_name: firstName,
    gender: text(body?.gender) || null,
    last_name: lastName,
    middle_name: text(body?.middleName) || null,
    updated_at: new Date().toISOString(),
  });
  if (!updated[0]) throw createApiError("USER_NOT_FOUND", "The user account could not be found.", 404);
  await insertRow("admin_account_lifecycle_events", {
    account_id: userId, account_type: "user", action: "profile_updated",
    actor_email: admin.email, reason: text(body?.reason) || null,
  });
  return updated[0];
};
