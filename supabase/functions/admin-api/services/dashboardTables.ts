import { getOptionalTable, getTable } from "../repository.ts";
import type { Row } from "../types.ts";

const TABLE_NAMES = [
  "users", "admins", "admin_roles", "buyers", "farmers", "farms",
  "categories", "commodities", "carts", "cart_items", "orders", "payments",
  "reviews", "rider_ratings", "deliveries", "logistics_companies", "riders",
  "admin_manual_records", "admin_review_responses", "admin_review_moderation",
  "admin_review_moderation_events",
];

const OPTIONAL_TABLES = new Set([
  "admin_manual_records", "admin_review_responses", "admin_review_moderation",
  "admin_review_moderation_events",
]);

export const getDashboardTables = async () => {
  const entries = await Promise.all(TABLE_NAMES.map(async (table) => [
    table,
    OPTIONAL_TABLES.has(table) ? await getOptionalTable(table) : await getTable(table),
  ] as const));
  return Object.fromEntries(entries) as Record<string, Row[]>;
};
