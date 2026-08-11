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

module.exports = {
  approveAdminFarmer,
  approveAdminRider,
  createDashboardUser,
  getAdminDashboard,
};
