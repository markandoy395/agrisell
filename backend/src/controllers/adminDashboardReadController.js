const {
  approveFarmer, approveRider, getDashboardData,
} = require('../services/adminDashboardService');
const {
  filterDashboardByPermissions,
} = require('../modules/admin/dashboard/adminDashboardPermissions');
const { SupabaseRequestError } = require('../services/supabaseService');
const { sendJson } = require('../utils/http');

const isConfigurationError = (error) =>
  error instanceof SupabaseRequestError && error.code === 'DATABASE_NOT_CONFIGURED';

const getAdminDashboard = async (request, response) => {
  try {
    const dashboard = await getDashboardData();
    sendJson(response, 200, filterDashboardByPermissions(
      dashboard, request.admin.permissions,
    ));
  } catch (error) {
    const configurationError = isConfigurationError(error);
    console.error('Unable to load the Agrisell admin database.', error);
    sendJson(response, configurationError ? 503 : 502, {
      code: configurationError ? 'DATABASE_NOT_CONFIGURED' : 'DATABASE_UNAVAILABLE',
      message: configurationError
        ? 'The admin database connection is not configured on the server.'
        : 'The admin database could not be reached. Please try again.',
    });
  }
};

const approveEntity = async (response, entityName, loadEntity, entityId) => {
  try {
    const entity = await loadEntity(entityId);
    if (!entity) {
      sendJson(response, 404, {
        code: `${entityName.toUpperCase()}_NOT_FOUND`,
        message: `The ${entityName} profile could not be found.`,
      });
      return;
    }
    sendJson(response, 200, { [entityName]: entity });
  } catch (error) {
    const configurationError = isConfigurationError(error);
    console.error(`Unable to approve the ${entityName}.`, error);
    sendJson(response, configurationError ? 503 : 502, {
      code: configurationError ? 'DATABASE_NOT_CONFIGURED' : 'DATABASE_UNAVAILABLE',
      message: configurationError
        ? 'The admin database connection is not configured on the server.'
        : `The ${entityName} approval could not be saved. Please try again.`,
    });
  }
};

const approveAdminFarmer = (_request, response, farmerId) =>
  approveEntity(response, 'farmer', approveFarmer, farmerId);

const approveAdminRider = (_request, response, riderId) =>
  approveEntity(response, 'rider', approveRider, riderId);

module.exports = { approveAdminFarmer, approveAdminRider, getAdminDashboard };
