const {
  approveFarmer,
  approveRider,
  getDashboardData,
} = require('../services/adminDashboardService');
const {
  AdminUserCreationError,
  createAdminUser,
} = require('../services/adminUserService');
const { SupabaseRequestError } = require('../services/supabaseService');
const {
  AdminSaleError,
  createSale,
  listSaleProducts,
  listSales,
  removeSale,
  setSaleEnabled,
  updateSale,
} = require('../services/adminSaleService');
const { getHeaderValue, readJsonBody, sendJson } = require('../utils/http');

const getAdminDashboard = async (_request, response) => {
  try {
    sendJson(response, 200, await getDashboardData());
  } catch (error) {
    const isConfigurationError =
      error instanceof SupabaseRequestError &&
      error.code === 'DATABASE_NOT_CONFIGURED';

    console.error('Unable to load the Agrisell admin database.', error);
    sendJson(response, isConfigurationError ? 503 : 502, {
      code: isConfigurationError
        ? 'DATABASE_NOT_CONFIGURED'
        : 'DATABASE_UNAVAILABLE',
      message: isConfigurationError
        ? 'The admin database connection is not configured on the server.'
        : 'The admin database could not be reached. Please try again.',
    });
  }
};

const approveAdminFarmer = async (_request, response, farmerId) => {
  try {
    const farmer = await approveFarmer(farmerId);

    if (!farmer) {
      sendJson(response, 404, {
        code: 'FARMER_NOT_FOUND',
        message: 'The farmer profile could not be found.',
      });
      return;
    }

    sendJson(response, 200, { farmer });
  } catch (error) {
    const isConfigurationError =
      error instanceof SupabaseRequestError &&
      error.code === 'DATABASE_NOT_CONFIGURED';

    console.error('Unable to approve the farmer.', error);
    sendJson(response, isConfigurationError ? 503 : 502, {
      code: isConfigurationError
        ? 'DATABASE_NOT_CONFIGURED'
        : 'DATABASE_UNAVAILABLE',
      message: isConfigurationError
        ? 'The admin database connection is not configured on the server.'
        : 'The farmer approval could not be saved. Please try again.',
    });
  }
};

const approveAdminRider = async (_request, response, riderId) => {
  try {
    const rider = await approveRider(riderId);

    if (!rider) {
      sendJson(response, 404, {
        code: 'RIDER_NOT_FOUND',
        message: 'The rider profile could not be found.',
      });
      return;
    }

    sendJson(response, 200, { rider });
  } catch (error) {
    const isConfigurationError =
      error instanceof SupabaseRequestError &&
      error.code === 'DATABASE_NOT_CONFIGURED';

    console.error('Unable to approve the rider.', error);
    sendJson(response, isConfigurationError ? 503 : 502, {
      code: isConfigurationError
        ? 'DATABASE_NOT_CONFIGURED'
        : 'DATABASE_UNAVAILABLE',
      message: isConfigurationError
        ? 'The admin database connection is not configured on the server.'
        : 'The rider approval could not be saved. Please try again.',
    });
  }
};

const createDashboardUser = async (request, response) => {
  const contentType = getHeaderValue(request.headers['content-type']) ?? '';

  if (!contentType.includes('application/json')) {
    sendJson(response, 415, {
      code: 'JSON_REQUIRED',
      message: 'User creation requests must use application/json.',
    });
    return;
  }

  try {
    const user = await createAdminUser(await readJsonBody(request, { maxBytes: 12_000 }));
    sendJson(response, 201, { user });
  } catch (error) {
    if (error instanceof AdminUserCreationError) {
      sendJson(response, error.statusCode, { code: error.code, message: error.message });
      return;
    }

    const isConfigurationError =
      error instanceof SupabaseRequestError && error.code === 'DATABASE_NOT_CONFIGURED';
    console.error('Unable to create the user.', error);
    sendJson(response, isConfigurationError ? 503 : 502, {
      code: isConfigurationError ? 'DATABASE_NOT_CONFIGURED' : 'USER_CREATION_FAILED',
      message: isConfigurationError
        ? 'The admin database connection is not configured on the server.'
        : 'The user could not be created. Please try again.',
    });
  }
};

const saleError = (response, error) => {
  if (error instanceof AdminSaleError) {
    sendJson(response, error.statusCode, { code: 'SALE_INVALID', message: error.message });
    return;
  }
  console.error('Unable to manage product sales.', error);
  sendJson(response, error instanceof SupabaseRequestError ? 503 : 502, {
    code: 'SALE_UNAVAILABLE', message: 'The sale could not be saved. Please try again.',
  });
};

const getAdminSales = async (_request, response) => {
  try {
    const [sales, products] = await Promise.all([listSales(), listSaleProducts()]);
    sendJson(response, 200, { sales, products });
  } catch (error) { saleError(response, error); }
};

const createAdminSale = async (request, response) => {
  try { sendJson(response, 201, { sale: await createSale(await readJsonBody(request, { maxBytes: 250_000 })) }); } catch (error) { saleError(response, error); }
};

const updateAdminSaleEnabled = async (request, response, saleId) => {
  try {
    const body = await readJsonBody(request, { maxBytes: 250_000 });
    if (typeof body.isEnabled === 'boolean' && Object.keys(body).length === 1) {
      sendJson(response, 200, { sale: await setSaleEnabled(saleId, body.isEnabled) });
      return;
    }
    sendJson(response, 200, { sale: await updateSale(saleId, body) });
  } catch (error) { saleError(response, error); }
};

const deleteAdminSale = async (_request, response, saleId) => {
  try { await removeSale(saleId); sendJson(response, 204, {}); } catch (error) { saleError(response, error); }
};

module.exports = {
  approveAdminFarmer,
  approveAdminRider,
  createAdminSale,
  createDashboardUser,
  deleteAdminSale,
  getAdminSales,
  getAdminDashboard,
  updateAdminSaleEnabled,
};
