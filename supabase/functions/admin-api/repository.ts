import { QUERY_LIMIT, SERVICE_ROLE_KEY, SUPABASE_URL } from "./config.ts";
import type { Row } from "./types.ts";
import { createApiError, rows } from "./value.ts";

export const requestSupabase = async (path: string, init: RequestInit = {}) => {
  const result = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      ...init.headers,
    },
  });
  const payload = await result.json().catch(() => null);
  if (!result.ok) {
    throw new Error(typeof payload?.message === "string"
      ? payload.message : "Supabase request failed.");
  }
  return payload;
};

export const getTable = async (table: string, filters: Record<string, string> = {}) => {
  const params = new URLSearchParams({
    select: "*", limit: String(QUERY_LIMIT), ...filters,
  });
  return rows(await requestSupabase(`/rest/v1/${table}?${params}`));
};

export const getOptionalTable = async (table: string) => {
  try {
    return await getTable(table);
  } catch (error) {
    if (error instanceof Error && /schema cache|could not find the table/i.test(error.message)) {
      return [];
    }
    throw error;
  }
};

export const insertRow = async (
  table: string,
  row: Row,
  prefer = "return=representation",
) => {
  const result = rows(await requestSupabase(`/rest/v1/${table}`, {
    body: JSON.stringify(row),
    headers: { "Content-Type": "application/json", Prefer: prefer },
    method: "POST",
  }));
  if (!result[0]) {
    throw createApiError("SALE_INVALID", "The promotion could not be saved.", 502);
  }
  return result[0];
};

export const insertRows = async (table: string, records: Row[]) => {
  if (!records.length) return [];
  const result = rows(await requestSupabase(`/rest/v1/${table}`, {
    body: JSON.stringify(records),
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    method: "POST",
  }));
  if (result.length !== records.length) {
    throw createApiError(
      "SALE_INVALID", "Not all selected products could be attached to the promotion.", 502,
    );
  }
  return result;
};

export const updateRows = async (table: string, query: string, updates: Row) =>
  rows(await requestSupabase(`/rest/v1/${table}?${query}`, {
    body: JSON.stringify(updates),
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    method: "PATCH",
  }));

export const deleteRows = async (table: string, query: string) =>
  rows(await requestSupabase(`/rest/v1/${table}?${query}`, {
    headers: { Prefer: "return=representation" }, method: "DELETE",
  }));
