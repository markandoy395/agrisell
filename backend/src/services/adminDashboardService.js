const { getPermissionsForAdminRole } = require('./sessionService');
const { updateSupabaseRows } = require('./supabaseService');
const { createEntityRows } = require('../modules/admin/dashboard/adminDashboardEntityRows');
const { createOverview } = require('../modules/admin/dashboard/adminDashboardOverview');
const {
  createFarmerFarms,
  createFarmerRows,
  createOrderRows,
  createPaymentRows,
  createUserRows,
} = require('../modules/admin/dashboard/adminDashboardPrimaryRows');
const { getDashboardTables } = require('../modules/admin/dashboard/adminDashboardRepository');
const {
  createIndex, getId, getName, getText, groupRows,
} = require('../modules/admin/dashboard/adminDashboardValue');

const getRolePermissions = (role) => {
  const description = getText(role?.description);
  if (!description.toLowerCase().startsWith('privileges:')) return undefined;
  return description.slice('privileges:'.length).split(',')
    .map((permission) => permission.trim()).filter(Boolean);
};

const createAdministrators = (data, usersById) => {
  const adminRolesByUser = createIndex(data.adminRoles, 'user_id');
  return data.admins.map((admin) => {
    const userId = getId(admin.user_id);
    const user = usersById.get(userId);
    const role = getText(admin.admin_role).toLowerCase();
    if (!userId || (role !== 'admin' && role !== 'super_admin')) return null;
    return {
      email: user ? getText(user.email, 'Email not recorded') : 'Email not recorded',
      enabled: getText(user?.account_status).toLowerCase() === 'active',
      name: user ? getName(user, `Admin ${userId}`) : `Admin ${userId}`,
      permissions: getPermissionsForAdminRole(
        role,
        getRolePermissions(adminRolesByUser.get(userId)),
      ),
      role,
      userId,
    };
  }).filter(Boolean);
};

const createDashboardRows = (data) => {
  const usersById = createIndex(data.users, 'user_id');
  const buyersById = createIndex(data.buyers, 'buyer_user_id');
  const commoditiesById = createIndex(data.commodities, 'commodity_id');
  const cartItemsById = createIndex(data.cartItems, 'cart_item_id');
  const cartsById = createIndex(data.carts, 'cart_id');
  const farmerFarms = createFarmerFarms({
    commoditiesByFarm: groupRows(data.commodities, 'farm_id'),
    farms: data.farms,
  });
  const farmerRows = createFarmerRows({
    farmers: data.farmers,
    farmsByFarmer: groupRows(data.farms, 'farmer_user_id'),
  });
  const orderRows = createOrderRows({
    buyersById, cartItemsById, cartsById, commoditiesById,
    deliveries: data.deliveries, orders: data.orders, usersById,
  });
  const orderRowsById = new Map(
    orderRows.map((order) => [order.id.replace(/^AG-/, ''), order]),
  );
  const paymentRows = createPaymentRows({
    orderRowsById,
    ordersById: createIndex(data.orders, 'order_id'),
    payments: data.payments,
  });
  return {
    cartItemsById, commoditiesById, farmerFarms, farmerRows,
    orderRows, paymentRows, usersById,
  };
};

const getDashboardData = async () => {
  const data = await getDashboardTables();
  const rows = createDashboardRows(data);
  return {
    administrators: createAdministrators(data, rows.usersById),
    entityRows: createEntityRows({
      data,
      farmerFarms: rows.farmerFarms,
      farmerRows: rows.farmerRows,
      usersById: rows.usersById,
    }),
    farmerFarms: rows.farmerFarms,
    farmers: rows.farmerRows,
    orders: rows.orderRows,
    overview: createOverview({
      cartItemsById: rows.cartItemsById,
      commoditiesById: rows.commoditiesById,
      data,
      orderRows: rows.orderRows,
      paymentRows: rows.paymentRows,
    }),
    payments: rows.paymentRows,
    users: createUserRows({
      adminsByUser: createIndex(data.admins, 'user_id'),
      buyersByUser: createIndex(data.buyers, 'user_id'),
      users: data.users,
    }),
  };
};

const updateApproval = async (table, idField, id, values) => {
  const normalizedId = getId(id);
  if (!normalizedId) return null;
  const updatedRows = await updateSupabaseRows(
    table,
    { [idField]: `eq.${normalizedId}` },
    { ...values, updated_at: new Date().toISOString() },
  );
  return updatedRows[0] ?? null;
};

const approveFarmer = (farmerId) => updateApproval(
  'farmers', 'farmer_user_id', farmerId,
  { account_status: 'active', verification_status: 'verified' },
);

const approveRider = (riderId) => updateApproval(
  'riders', 'rider_id', riderId,
  { employment_status: 'active', verification_status: 'verified' },
);

module.exports = { approveFarmer, approveRider, getDashboardData };
