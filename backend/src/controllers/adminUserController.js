const { AdminUserCreationError, createAdminUser } = require('../services/adminUserService');
const {
  createAdministrator: provisionAdministrator,
  updateAdministratorPrivileges: saveAdministratorPrivileges,
} = require('../modules/admin/accounts/adminManagementService');
const { ADMIN_PERMISSIONS } = require('../services/sessionService');
const { SupabaseRequestError } = require('../services/supabaseService');
const { getHeaderValue, readJsonBody, sendJson } = require('../utils/http');

const getPermissions = (value) => Array.isArray(value)
  ? [...new Set(value.filter((item) => typeof item === 'string'))] : [];

const hasValidPermissions = (permissions) =>
  permissions.length > 0 && permissions.every((item) => ADMIN_PERMISSIONS.includes(item));

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
    const configurationError = error instanceof SupabaseRequestError &&
      error.code === 'DATABASE_NOT_CONFIGURED';
    console.error('Unable to create the user.', error);
    sendJson(response, configurationError ? 503 : 502, {
      code: configurationError ? 'DATABASE_NOT_CONFIGURED' : 'USER_CREATION_FAILED',
      message: configurationError
        ? 'The admin database connection is not configured on the server.'
        : 'The user could not be created. Please try again.',
    });
  }
};

const createAdministrator = async (request, response) => {
  const contentType = getHeaderValue(request.headers['content-type']) ?? '';
  if (!contentType.includes('application/json')) {
    sendJson(response, 415, {
      code: 'JSON_REQUIRED',
      message: 'Administrator creation requests must use application/json.',
    });
    return;
  }
  try {
    const body = await readJsonBody(request, { maxBytes: 12_000 });
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
    const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';
    const permissions = getPermissions(body.permissions);
    if (!firstName || !lastName || firstName.length > 100 || lastName.length > 100) {
      sendJson(response, 400, {
        code: 'INVALID_ADMIN_PAYLOAD', message: 'Enter a valid first and last name.',
      });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      sendJson(response, 400, {
        code: 'INVALID_ADMIN_PAYLOAD', message: 'Enter a valid email address.',
      });
      return;
    }
    if (password.length < 8 || password.length > 512) {
      sendJson(response, 400, {
        code: 'INVALID_ADMIN_PAYLOAD',
        message: 'Password must be between 8 and 512 characters.',
      });
      return;
    }
    if (!hasValidPermissions(permissions)) {
      sendJson(response, 400, {
        code: 'INVALID_ADMIN_PRIVILEGES',
        message: 'Select at least one valid administrator privilege.',
      });
      return;
    }
    const admin = await provisionAdministrator({
      adminEmail: request.admin.email,
      email, firstName, lastName, password, permissions, role: 'admin',
    });
    sendJson(response, 201, { admin });
  } catch (error) {
    console.error('Unable to create the administrator.', error);
    const duplicate = error instanceof SupabaseRequestError &&
      (error.status === 409 || error.status === 422 || error.code === 'ADMIN_ALREADY_EXISTS');
    sendJson(response, duplicate ? 409 : 502, {
      code: duplicate ? 'ADMIN_ALREADY_EXISTS' : 'ADMIN_CREATION_FAILED',
      message: duplicate ? 'An account already uses this email address.'
        : 'The administrator could not be created. Please try again.',
    });
  }
};

const updateAdministratorPrivileges = async (request, response, userId) => {
  try {
    const body = await readJsonBody(request, { maxBytes: 4_000 });
    const permissions = getPermissions(body.permissions);
    if (!hasValidPermissions(permissions)) {
      sendJson(response, 400, {
        code: 'INVALID_ADMIN_PRIVILEGES',
        message: 'Select at least one valid administrator privilege.',
      });
      return;
    }
    const result = await saveAdministratorPrivileges(userId, permissions);
    const { targetRole } = result;
    if (targetRole !== 'admin') {
      sendJson(response, targetRole === 'super_admin' ? 403 : 404, {
        code: targetRole === 'super_admin' ? 'SUPER_ADMIN_IMMUTABLE' : 'ADMIN_NOT_FOUND',
        message: targetRole === 'super_admin'
          ? 'Superadmin privileges cannot be restricted.'
          : 'The administrator account could not be found.',
      });
      return;
    }
    sendJson(response, 200, { permissions, userId });
  } catch (error) {
    console.error('Unable to update administrator privileges.', error);
    sendJson(response, 502, {
      code: 'ADMIN_PRIVILEGES_UPDATE_FAILED',
      message: 'The administrator privileges could not be updated. Please try again.',
    });
  }
};

module.exports = { createAdministrator, createDashboardUser, updateAdministratorPrivileges };
