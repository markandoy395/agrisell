import type { Row } from "./types.ts";

export const text = (value: unknown, fallback = "") =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

export const id = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";

export const number = (value: unknown, fallback = 0) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const rows = (value: unknown): Row[] => Array.isArray(value)
  ? value.filter((item): item is Row =>
    typeof item === "object" && item !== null && !Array.isArray(item))
  : [];

export const display = (value: unknown, fallback = "Not set") => {
  const valueText = text(value);
  return valueText
    ? valueText.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : fallback;
};

export const name = (row: Row, fallback: string) => {
  const fullName = text(row.full_name);
  if (fullName) return fullName;
  const parts = [row.first_name, row.middle_name, row.last_name, row.extension_name]
    .map((part) => text(part)).filter(Boolean);
  return parts.length ? parts.join(" ") : fallback;
};

export const tone = (status: unknown) => {
  const value = text(status).toLowerCase();
  if (/(fail|cancel|inactive|unavailable|overdue)/.test(value)) return "red";
  if (/(active|available|verified|completed|delivered|published|paid)/.test(value)) return "green";
  if (/(delivery|transit|processing|pending|awaiting|review)/.test(value)) return "blue";
  return "orange";
};

export const paymentStatus = (value: unknown) => {
  const status = text(value).toLowerCase();
  if (/(complete|paid|success|settled)/.test(status)) return "Completed";
  if (/(fail|cancel|refund|reject)/.test(status)) return "Failed";
  return "Pending";
};

export const money = (value: unknown) => new Intl.NumberFormat("en-PH", {
  style: "currency", currency: "PHP",
}).format(number(value));

export const date = (value: unknown) => {
  const parsed = new Date(text(value));
  return Number.isNaN(parsed.getTime()) ? "Not recorded" : new Intl.DateTimeFormat("en-PH", {
    day: "2-digit", month: "short", year: "numeric",
  }).format(parsed);
};

export const indexBy = (source: Row[], field: string) => new Map<string, Row>(
  source.map((row): [string, Row] => [id(row[field]), row]).filter(([key]) => Boolean(key)),
);

export const createApiError = (code: string, message: string, status = 400) =>
  Object.assign(new Error(message), { code, status });
