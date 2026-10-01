export const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.replace(/\/+$/, "") ?? "";
export const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
export const QUERY_LIMIT = Number(Deno.env.get("SUPABASE_QUERY_LIMIT") ?? 1000);
export const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",").map((origin) => origin.trim()).filter(Boolean);

export const ADMIN_PERMISSIONS = [
  "overview:view", "users:manage", "farmers:manage", "logistics:manage",
  "orders:manage", "payments:view", "payments:manage", "sales:manage",
  "reviews:manage", "support:manage", "settings:manage",
];

export const DEFAULT_ADMIN_PERMISSIONS = [
  "overview:view", "users:manage", "farmers:manage", "support:manage",
];

