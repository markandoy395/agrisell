import type { EntityInfo, EntityTableColumn } from "../types/dashboard";

const sectionDescriptions: Record<string, string> = {
  Admins: "Administrative accounts assigned to manage Agrisell.",
  "Admin Roles": "Access roles that define each administrator's permissions.",
  Buyers: "Buyer profiles, addresses, and marketplace preferences.",
  Carts: "Buyer carts and their current checkout status.",
  "Cart Items": "Commodity selections currently held in buyer carts.",
  Categories: "Commodity categories used across the marketplace catalog.",
  Commodities: "Produce available across the farm network.",
  Deliveries: "Delivery assignments and fulfilment activity.",
  Farmers: "Verified farmers and their registered farms.",
  Farms: "Farm profiles, locations, certifications, and production details.",
  "Logistics Companies": "Riders and logistics companies serving marketplace deliveries.",
  "Order Items": "Individual commodities and quantities purchased in each order.",
  Orders: "Purchases moving through the marketplace.",
  Payments: "Payment records and settlement status.",
  Reviews: "Database feedback for farmers and riders.",
  Riders: "Delivery riders, vehicles, availability, and performance.",
  Users: "Buyers, administrators, and marketplace accounts.",
};

const irregularSingular: Record<string, string> = {
  "Admin Roles": "admin role",
  "Cart Items": "cart item",
  Categories: "category",
  Commodities: "commodity",
  Deliveries: "delivery",
  "Logistics Companies": "rider",
  "Order Items": "order item",
};

export const getEntityInfo = (section: string): EntityInfo => ({
  description: sectionDescriptions[section] ?? `Live ${section.toLowerCase()} database records.`,
  singular: irregularSingular[section] ?? section.replace(/s$/, "").toLowerCase(),
  total: "",
});

const columnLabels: Record<string, [string, string, string, string]> = {
  Deliveries: ["DELIVERY", "ROUTE / RIDER", "SCHEDULE", "STATUS"],
  Farms: ["FARM", "FARM TYPE", "SIZE", "STATUS"],
  "Logistics Companies": ["RIDER", "LOGISTICS COMPANY", "VEHICLE / DELIVERIES", "AVAILABILITY"],
  Payments: ["PAYMENT", "METHOD", "AMOUNT", "STATUS"],
  Reviews: ["REVIEWER", "REVIEW TYPE", "RATING", "STATUS"],
};

export const getEntityTableColumns = (section: string): EntityTableColumn[] => {
  const labels = columnLabels[section] ?? [
    section.replace(/s$/, "").toUpperCase(),
    "TYPE / CATEGORY",
    "DETAIL",
    "STATUS",
  ];

  return [
    { label: labels[0], field: "primary", helperField: "secondary" },
    { label: labels[1], field: "category" },
    { label: labels[2], field: "value" },
    { label: labels[3], field: "status", isStatus: true },
  ];
};
