const {
  approveFarmer,
  approveRider,
  getDashboardData,
} = require('../services/adminDashboardService');
const {
  AdminUserCreationError,
  createAdminUser,
} = require('../services/adminUserService');
const {
  SupabaseRequestError,
  getSupabaseRows,
  insertSupabaseRow,
  uploadSupabaseProfileImage,
  updateSupabaseRows,
} = require('../services/supabaseService');
const { ADMIN_PERMISSIONS } = require('../services/sessionService');
const { provisionAdminAccount } = require('../services/supabaseAdminAuthService');
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

const getAdminDashboard = async (request, response) => {
  try {
    const dashboard = await getDashboardData();
    if (!request.admin.permissions.includes('admin:manage')) {
      dashboard.administrators = [];
    }
    sendJson(response, 200, dashboard);
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

const updateAdminProfile = async (request, response) => {
  try {
    const body = await readJsonBody(request, { maxBytes: 900_000 });
    const name = typeof body.name === 'string' ? body.name.trim().replace(/\s+/g, ' ') : '';
    const avatarUrl = typeof body.avatarUrl === 'string' ? body.avatarUrl.trim() : '';

    if (!name || name.length > 200) {
      sendJson(response, 400, {
        code: 'INVALID_ADMIN_PROFILE',
        message: 'Enter a valid profile name.',
      });
      return;
    }
    if (avatarUrl && (
      avatarUrl.length > 650_000 ||
      !/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(avatarUrl)
    )) {
      sendJson(response, 400, {
        code: 'INVALID_PROFILE_IMAGE',
        message: 'Choose a valid JPG, PNG, or WEBP profile image.',
      });
      return;
    }

    const users = await getSupabaseRows('users', { email: `eq.${request.admin.email}` });
    const user = users[0];
    if (!user?.user_id) {
      sendJson(response, 404, {
        code: 'ADMIN_PROFILE_NOT_FOUND',
        message: 'The administrator profile could not be found.',
      });
      return;
    }

    const nameParts = name.split(' ');
    const lastName = nameParts.length > 1 ? nameParts.pop() : '';
    const updates = {
      extension_name: null,
      first_name: nameParts.join(' ') || name,
      last_name: lastName,
      middle_name: null,
    };
    if (avatarUrl) {
      updates.profile_photo_url = await uploadSupabaseProfileImage(user.user_id, avatarUrl);
    }

    const updatedUsers = await updateSupabaseRows('users', { user_id: `eq.${user.user_id}` }, updates);
    const updatedUser = updatedUsers[0];
    if (!updatedUser) {
      sendJson(response, 404, {
        code: 'ADMIN_PROFILE_NOT_FOUND',
        message: 'The administrator profile could not be found.',
      });
      return;
    }

    sendJson(response, 200, {
      profile: {
        avatarUrl: String(updatedUser.profile_photo_url ?? ''),
        email: String(updatedUser.email ?? request.admin.email),
        name: [updatedUser.first_name, updatedUser.middle_name, updatedUser.last_name, updatedUser.extension_name]
          .map((value) => String(value ?? '').trim())
          .filter(Boolean)
          .join(' ') || name,
      },
    });
  } catch (error) {
    console.error('Unable to update the administrator profile.', error);
    const statusCode = error.statusCode ?? error.status ?? 502;
    sendJson(response, statusCode, {
      code: error.code ?? 'ADMIN_PROFILE_UPDATE_FAILED',
      message: statusCode < 500
        ? error.message
        : 'The administrator profile could not be saved. Please try again.',
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

const createAdministrator = async (request, response) => {
  const contentType = getHeaderValue(request.headers['content-type']) ?? '';
  if (!contentType.includes('application/json')) {
    sendJson(response, 415, { code: 'JSON_REQUIRED', message: 'Administrator creation requests must use application/json.' });
    return;
  }

  try {
    const body = await readJsonBody(request, { maxBytes: 12_000 });
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : '';
    const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : '';
    const permissions = Array.isArray(body.permissions)
      ? [...new Set(body.permissions.filter((item) => typeof item === 'string'))]
      : [];
    if (!firstName || !lastName || firstName.length > 100 || lastName.length > 100) {
      sendJson(response, 400, { code: 'INVALID_ADMIN_PAYLOAD', message: 'Enter a valid first and last name.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      sendJson(response, 400, { code: 'INVALID_ADMIN_PAYLOAD', message: 'Enter a valid email address.' });
      return;
    }
    if (password.length < 8 || password.length > 512) {
      sendJson(response, 400, { code: 'INVALID_ADMIN_PAYLOAD', message: 'Password must be between 8 and 512 characters.' });
      return;
    }
    if (!permissions.length || permissions.some((item) => !ADMIN_PERMISSIONS.includes(item))) {
      sendJson(response, 400, { code: 'INVALID_ADMIN_PRIVILEGES', message: 'Select at least one valid administrator privilege.' });
      return;
    }
    const assigningUsers = await getSupabaseRows('users', { email: `eq.${request.admin.email}` });
    const admin = await provisionAdminAccount({
      assignedByUserId: assigningUsers[0]?.user_id,
      email,
      firstName,
      lastName,
      password,
      permissions,
      role: 'admin',
    });
    sendJson(response, 201, { admin });
  } catch (error) {
    console.error('Unable to create the administrator.', error);
    const duplicate = error instanceof SupabaseRequestError &&
      (error.status === 409 || error.status === 422 || error.code === 'ADMIN_ALREADY_EXISTS');
    sendJson(response, duplicate ? 409 : 502, {
      code: duplicate ? 'ADMIN_ALREADY_EXISTS' : 'ADMIN_CREATION_FAILED',
      message: duplicate
        ? 'An account already uses this email address.'
        : 'The administrator could not be created. Please try again.',
    });
  }
};

const updateAdministratorPrivileges = async (request, response, userId) => {
  try {
    const body = await readJsonBody(request, { maxBytes: 4_000 });
    const permissions = Array.isArray(body.permissions)
      ? [...new Set(body.permissions.filter((item) => typeof item === 'string'))]
      : [];
    if (!permissions.length || permissions.some((item) => !ADMIN_PERMISSIONS.includes(item))) {
      sendJson(response, 400, { code: 'INVALID_ADMIN_PRIVILEGES', message: 'Select at least one valid administrator privilege.' });
      return;
    }

    const targetAdmins = await getSupabaseRows('admins', { user_id: `eq.${userId}` });
    const targetRole = String(targetAdmins[0]?.admin_role ?? '').trim().toLowerCase();
    if (targetRole !== 'admin') {
      sendJson(response, targetRole === 'super_admin' ? 403 : 404, {
        code: targetRole === 'super_admin' ? 'SUPER_ADMIN_IMMUTABLE' : 'ADMIN_NOT_FOUND',
        message: targetRole === 'super_admin'
          ? 'Superadmin privileges cannot be restricted.'
          : 'The administrator account could not be found.',
      });
      return;
    }

    const description = `Privileges: ${permissions.join(', ')}`;
    const roles = await updateSupabaseRows('admin_roles', { user_id: `eq.${userId}` }, { description });
    if (!roles.length) {
      await insertSupabaseRow('admin_roles', {
        description,
        role_level: 50,
        role_name: 'Administrator',
        user_id: userId,
      });
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
  createAdministrator,
  createDashboardUser,
  deleteAdminSale,
  getAdminSales,
  getAdminDashboard,
  updateAdminSaleEnabled,
  updateAdminProfile,
  updateAdministratorPrivileges,
};
