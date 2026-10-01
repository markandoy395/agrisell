import type { Row } from "../types.ts";
import { createApiError, text } from "../value.ts";

export type VerificationType = "farmer" | "rider";

export const readDecision = (payload: unknown) => {
  const body = payload as Row | null;
  const action = text(body?.action);
  const reason = text(body?.reason);
  const message = text(body?.message);
  const missingItems = Array.isArray(body?.missingItems)
    ? body.missingItems.map((item) => text(item)).filter(Boolean).slice(0, 20) : [];
  const valid = [
    "profile_updated", "verified", "rejected", "needs_information",
    "suspended", "deactivated", "reactivated",
  ];
  if (!valid.includes(action)) {
    throw createApiError("INVALID_DECISION", "Choose a valid verification or lifecycle decision.", 400);
  }
  if (["rejected", "suspended", "deactivated"].includes(action) && !reason) {
    throw createApiError("REASON_REQUIRED", "A reason is required for this decision.", 400);
  }
  if (action === "needs_information" && (!message || !missingItems.length)) {
    throw createApiError(
      "MISSING_INFORMATION_REQUIRED",
      "Describe the request and select at least one missing item.", 400,
    );
  }
  return { action, body, message, missingItems, reason };
};

export const profileChanges = (
  entityType: VerificationType, profile: Row, body: Row | null, action: string,
) => {
  const editable = entityType === "farmer"
    ? ["first_name", "middle_name", "last_name", "suffix", "phone_number", "address_line", "barangay", "city_municipality", "province", "postal_code", "certification"]
    : ["first_name", "middle_name", "last_name", "contact_number", "complete_address", "license_number", "vehicle_type", "vehicle_plate_number"];
  const source = body?.profileUpdates && typeof body.profileUpdates === "object" &&
      !Array.isArray(body.profileUpdates) ? body.profileUpdates as Row : {};
  const edits: Row = Object.fromEntries(editable
    .filter((field) => Object.hasOwn(source, field))
    .map((field) => [field, text(source[field]) || null]));
  if ((Object.hasOwn(edits, "first_name") && !edits.first_name) ||
      (Object.hasOwn(edits, "last_name") && !edits.last_name)) {
    throw createApiError("INVALID_PROFILE", "First and last name cannot be empty.", 400);
  }
  if (entityType === "rider" && (Object.hasOwn(edits, "first_name") || Object.hasOwn(edits, "last_name"))) {
    edits.full_name = [edits.first_name ?? profile.first_name, profile.middle_name,
      edits.last_name ?? profile.last_name].map((part) => text(part)).filter(Boolean).join(" ");
  }
  const verification = ["verified", "rejected", "needs_information"].includes(action)
    ? action === "needs_information" ? "pending" : action : profile.verification_status;
  const account = action === "verified" || action === "reactivated" ? "active"
    : action === "rejected" ? "rejected" : action === "needs_information" ? "pending"
    : ["suspended", "deactivated"].includes(action) ? action : profile.account_status;
  const updatedAt = new Date().toISOString();
  if (entityType === "farmer") {
    return { ...edits, verification_status: verification, account_status: account, updated_at: updatedAt };
  }
  return {
    ...edits,
    employment_status: action === "profile_updated" ? profile.employment_status
      : ["verified", "reactivated"].includes(action) ? "active"
      : action === "suspended" ? "suspended" : "inactive",
    verification_status: verification,
    availability_status: ["profile_updated", "verified", "reactivated"].includes(action)
      ? profile.availability_status : "offline",
    updated_at: updatedAt,
  };
};
