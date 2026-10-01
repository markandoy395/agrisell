import type { Admin, Row } from "../types.ts";
import { getTable, insertRow } from "../repository.ts";
import { createApiError, text } from "../value.ts";

export const getPreferences = async (admin: Admin) => {
  let saved: Row | undefined;
  try {
    saved = (await getTable("admin_workspace_preferences", {
      admin_email: `eq.${admin.email}`,
    }))[0];
  } catch (error) {
    if (!(error instanceof Error) || !/schema cache|could not find the table/i.test(error.message)) {
      throw error;
    }
  }
  return {
    autoApprove: saved?.auto_approve_verified_listings ?? true,
    digest: saved?.daily_admin_digest ?? true,
  };
};

export const savePreferences = async (payload: unknown, admin: Admin) => {
  const body = payload as Row | null;
  if (typeof body?.autoApprove !== "boolean" || typeof body?.digest !== "boolean") {
    throw createApiError("INVALID_PREFERENCES", "Both workspace preferences must be true or false.", 400);
  }
  await insertRow("admin_workspace_preferences", {
    admin_email: admin.email,
    auto_approve_verified_listings: body.autoApprove,
    daily_admin_digest: body.digest,
    updated_at: new Date().toISOString(),
  }, "resolution=merge-duplicates,return=representation");
  return { autoApprove: body.autoApprove, digest: body.digest };
};

export const createManualRecord = async (payload: unknown, admin: Admin) => {
  const body = payload as Row | null;
  const name = text(body?.name);
  if (
    (body?.section !== "Logistics Companies" && body?.section !== "Riders") ||
    !name ||
    name.length > 200
  ) {
    throw createApiError("INVALID_RECORD", "Enter a valid rider draft name.", 400);
  }
  return await insertRow("admin_manual_records", {
    created_by_email: admin.email, name, section: body.section,
  });
};

export const requestFarmerInformation = async (farmerId: string, admin: Admin) => {
  const farmer = (await getTable("farmers", { farmer_user_id: `eq.${farmerId}` }))[0];
  if (!farmer) throw createApiError("FARMER_NOT_FOUND", "The farmer profile could not be found.", 404);
  const saved = await insertRow("admin_farmer_information_requests", {
    farmer_user_id: farmerId, requested_by_email: admin.email,
  });
  if (farmer.auth_user_id) {
    await insertRow("notifications", {
      category: "verification",
      description: "Please review your farmer profile and submit the missing or outdated verification information.",
      destination: "profile",
      metadata: { farmer_user_id: farmerId, request_id: saved.request_id },
      notification_type: "farmer_information_requested",
      recipient_auth_user_id: farmer.auth_user_id,
      title: "More farmer information required",
    });
  }
  return saved;
};
