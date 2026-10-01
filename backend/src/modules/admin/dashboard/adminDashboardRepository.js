// Loads the tables required to assemble the admin dashboard.
const { getSupabaseRows, SupabaseRequestError } = require('../../../services/supabaseService');
const { asRows } = require('./adminDashboardValue');

const TABLES = {
  adminRoles: 'admin_roles',
  admins: 'admins',
  buyers: 'buyers',
  cartItems: 'cart_items',
  carts: 'carts',
  categories: 'categories',
  commodities: 'commodities',
  deliveries: 'deliveries',
  farmers: 'farmers',
  farms: 'farms',
  logisticsCompanies: 'logistics_companies',
  manualRecords: 'admin_manual_records',
  orderItems: 'order_items',
  orders: 'orders',
  payments: 'payments',
  reviewModeration: 'admin_review_moderation',
  reviewModerationEvents: 'admin_review_moderation_events',
  reviewResponses: 'admin_review_responses',
  reviews: 'reviews',
  riderRatings: 'rider_ratings',
  riders: 'riders',
  users: 'users',
};

const OPTIONAL_TABLES = new Set([
  'admin_manual_records',
  'admin_review_responses',
  'admin_review_moderation',
  'admin_review_moderation_events',
]);

const getTableRows = async (table) => {
  try {
    return await getSupabaseRows(table);
  } catch (error) {
    if (
      OPTIONAL_TABLES.has(table) &&
      error instanceof SupabaseRequestError &&
      error.status === 404
    ) return [];
    throw error;
  }
};

const getDashboardTables = async () => {
  const entries = Object.entries(TABLES);
  const rows = await Promise.all(entries.map(([, table]) => getTableRows(table)));
  return Object.fromEntries(entries.map(([name], index) => [name, asRows(rows[index])]));
};

module.exports = { getDashboardTables };
