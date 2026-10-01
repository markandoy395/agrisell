import { requestSupabase } from "../repository.ts";
import type { Row } from "../types.ts";

export const invalidateNodeSessions = async (email: string) => {
  const result = await requestSupabase("/rest/v1/rpc/admin_invalidate_sessions", {
    body: JSON.stringify({ p_email: email.trim().toLowerCase() }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  }) as Row[] | Row;
  const row = Array.isArray(result) ? result[0] : result;
  return Number(row?.revoked_sessions) || 0;
};
