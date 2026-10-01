import { requestSupabase } from "../repository.ts";
import { createApiError, rows } from "../value.ts";

export const approveFarmer = async (farmerId: string) => {
  const updated = rows(await requestSupabase(
    `/rest/v1/farmers?farmer_user_id=eq.${encodeURIComponent(farmerId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        account_status: "active", verification_status: "verified",
        updated_at: new Date().toISOString(),
      }),
    },
  ));
  if (!updated[0]) {
    throw createApiError("FARMER_NOT_FOUND", "The farmer profile could not be found.", 404);
  }
  return updated[0];
};

export const approveRider = async (riderId: string) => {
  const updated = rows(await requestSupabase(
    `/rest/v1/riders?rider_id=eq.${encodeURIComponent(riderId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({
        employment_status: "active", verification_status: "verified",
        updated_at: new Date().toISOString(),
      }),
    },
  ));
  if (!updated[0]) {
    throw createApiError("RIDER_NOT_FOUND", "The rider profile could not be found.", 404);
  }
  return updated[0];
};
