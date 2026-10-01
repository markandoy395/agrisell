import type { Admin } from "../types.ts";
import { getTable, insertRow, requestSupabase, updateRows } from "../repository.ts";
import { createApiError, id, text } from "../value.ts";
import { getVerificationDocuments, saveDocumentDecisions } from "./verificationDocuments.ts";
import { profileChanges, readDecision, type VerificationType } from "./verificationValue.ts";

export type { VerificationType } from "./verificationValue.ts";

const profileKey = (type: VerificationType) =>
  type === "farmer" ? "farmer_user_id" : "rider_id";

const getProfile = async (type: VerificationType, entityId: string) => {
  const profile = (await getTable(`${type}s`, {
    [profileKey(type)]: `eq.${entityId}`,
  }))[0];
  if (!profile) {
    throw createApiError("PROFILE_NOT_FOUND", "The verification profile could not be found.", 404);
  }
  return profile;
};

export const getVerification = async (type: VerificationType, entityId: string) => {
  const profile = await getProfile(type, entityId);
  const documents = type === "rider" ? await getVerificationDocuments(entityId) : [];
  const actions = await getTable("admin_verification_actions", {
    entity_id: `eq.${entityId}`, entity_type: `eq.${type}`,
  });
  return { actions, documents, profile };
};

const notificationDescription = (
  type: VerificationType, action: string, reason: string, message: string,
) => action === "verified" ? `Your ${type} verification was approved.`
  : action === "rejected" ? `Your ${type} verification was rejected: ${reason}`
  : action === "needs_information" ? message
  : action === "reactivated" ? `Your ${type} account was reactivated.`
  : `Your ${type} account was ${action}: ${reason}`;

const notifyProfileOwner = async (
  recipient: string, type: VerificationType, entityId: string,
  decision: ReturnType<typeof readDecision>,
) => {
  if (!recipient || decision.action === "profile_updated") return;
  const { action, message, missingItems, reason } = decision;
  await insertRow("notifications", {
    category: "verification",
    description: notificationDescription(type, action, reason, message),
    destination: "profile",
    metadata: { action, entity_id: entityId, entity_type: type, missing_items: missingItems, reason: reason || null },
    notification_type: `${type}_verification_${action}`,
    recipient_auth_user_id: recipient,
    title: action === "verified" ? "Verification approved"
      : action === "rejected" ? "Verification rejected"
      : action === "needs_information" ? "More information required" : `Account ${action}`,
  });
};

export const updateVerification = async (
  type: VerificationType, entityId: string, payload: unknown, admin: Admin,
) => {
  const profile = await getProfile(type, entityId);
  const decision = readDecision(payload);
  if (decision.action === "reactivated" && text(profile.verification_status).toLowerCase() !== "verified") {
    throw createApiError(
      "VERIFICATION_REQUIRED", `Approve this ${type} before reactivating the account.`, 409,
    );
  }
  const authId = id(profile.auth_user_id ?? profile.auth_id);
  if (authId && ["suspended", "deactivated", "reactivated"].includes(decision.action)) {
    await requestSupabase(`/auth/v1/admin/users/${encodeURIComponent(authId)}`, {
      body: JSON.stringify({ ban_duration: decision.action === "reactivated" ? "none" : "876000h" }),
      headers: { "Content-Type": "application/json" }, method: "PUT",
    });
  }
  await updateRows(`${type}s`, `${profileKey(type)}=eq.${encodeURIComponent(entityId)}`,
    profileChanges(type, profile, decision.body, decision.action));
  if (type === "rider") await saveDocumentDecisions(entityId, decision.body?.documentDecisions);
  const saved = await insertRow("admin_verification_actions", {
    action: decision.action, actor_email: admin.email, entity_id: entityId,
    entity_type: type, message: decision.message || null,
    missing_items: decision.missingItems,
    previous_status: text(profile.verification_status ?? profile.employment_status) || null,
    reason: decision.reason || null,
  });
  await notifyProfileOwner(authId, type, entityId, decision);
  return saved;
};
