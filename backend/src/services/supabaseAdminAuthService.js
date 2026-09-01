const {
  SupabaseRequestError,
  getSupabaseRows,
  insertSupabaseRow,
  requestSupabaseAuth,
} = require('./supabaseService');
const {
  ADMIN_PERMISSIONS,
  getPermissionsForAdminRole,
  getPublicAdmin,
} = require('./sessionService');

const ADMIN_ROLES = new Set(['admin', 'super_admin']);

const getText = (value) => (typeof value === 'string' ? value.trim() : '');

const getUserId = (value) =>
  typeof value === 'number' || typeof value === 'string' ? String(value) : '';

const getAuthUser = async ({ email, password }) => {
  const body = await requestSupabaseAuth('/auth/v1/token?grant_type=password', {
    body: JSON.stringify({ email, password }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });

  if (!body || typeof body !== 'object' || !body.user || typeof body.user !== 'object') {
    return null;
  }

  return body.user;
};

const getApplicationUser = async (email) => {
  const users = await getSupabaseRows('users', { email: `eq.${email}` });

  return users.sort((current, next) =>
    Number(next.user_id ?? 0) - Number(current.user_id ?? 0),
  )[0] ?? null;
};

const getExistingAuthUser = async (email) => {
  const body = await requestSupabaseAuth('/auth/v1/admin/users?per_page=1000');
  const users = body && typeof body === 'object' && Array.isArray(body.users)
    ? body.users
    : [];

  return users.find((user) =>
    getText(user?.email).toLowerCase() === email.toLowerCase(),
  ) ?? null;
};

const getAdminRecord = async (userId) => {
  const admins = await getSupabaseRows('admins', { user_id: `eq.${userId}` });

  return admins.length === 1 ? admins[0] : null;
};

const getAdminRoleRecord = async (userId) => {
  const roles = await getSupabaseRows('admin_roles', { user_id: `eq.${userId}` });

  return roles[0] ?? null;
};

const getStoredPermissions = (admin, roleRecord) => {
  if (Array.isArray(admin?.permissions)) return admin.permissions;

  const description = getText(roleRecord?.description);
  if (!description.toLowerCase().startsWith('privileges:')) return undefined;

  return description
    .slice('privileges:'.length)
    .split(',')
    .map((permission) => permission.trim())
    .filter(Boolean);
};

const isSupabaseAdminEmail = async (email) => {
  const user = await getApplicationUser(email);

  if (!user) return false;

  const admin = await getAdminRecord(getUserId(user.user_id));
  const adminRole = getText(admin?.admin_role).toLowerCase();

  return Boolean(admin && ADMIN_ROLES.has(adminRole));
};

const authenticateSupabaseAdminCredentials = async (email, password) => {
  try {
    const authUser = await getAuthUser({ email, password });

    if (!authUser) {
      return { reason: 'INVALID_CREDENTIALS', success: false };
    }
  } catch (error) {
    if (error instanceof SupabaseRequestError && error.status === 400) {
      return { reason: 'INVALID_CREDENTIALS', success: false };
    }

    return { reason: 'DATABASE_UNAVAILABLE', success: false };
  }

  try {
    const user = await getApplicationUser(email);

    if (!user) return { reason: 'ADMIN_PERMISSION_REQUIRED', success: false };

    const admin = await getAdminRecord(getUserId(user.user_id));
    const adminRole = getText(admin?.admin_role).toLowerCase();

    if (!admin || !ADMIN_ROLES.has(adminRole)) {
      return { reason: 'ADMIN_PERMISSION_REQUIRED', success: false };
    }

    const roleRecord = await getAdminRoleRecord(getUserId(user.user_id));
    return {
      admin: getPublicAdmin({
        email,
        name: [user.first_name, user.middle_name, user.last_name, user.extension_name]
          .map(getText)
          .filter(Boolean)
          .join(' '),
        permissions: getPermissionsForAdminRole(
          adminRole,
          getStoredPermissions(admin, roleRecord),
        ),
      }),
      success: true,
    };
  } catch {
    return { reason: 'DATABASE_UNAVAILABLE', success: false };
  }
};

const createSupabaseAuthUser = async ({ email, password, role, firstName, lastName }) => {
  const body = await requestSupabaseAuth('/auth/v1/admin/users', {
    body: JSON.stringify({
      email,
      email_confirm: true,
      password,
      user_metadata: { first_name: firstName, last_name: lastName, requested_role: role },
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });

  const user = body && typeof body === 'object' && body.user && typeof body.user === 'object'
    ? body.user
    : body;

  if (!user || typeof user !== 'object' || !getText(user.id)) {
    throw new SupabaseRequestError(
      'DATABASE_INVALID_RESPONSE',
      'Supabase did not return the new authentication user.',
    );
  }

  return user;
};

const provisionAdminAccount = async ({
  assignedByUserId,
  email,
  firstName,
  lastName,
  password,
  permissions,
  role,
}) => {
  if (!ADMIN_ROLES.has(role)) {
    throw new Error('Only admin and super_admin accounts can be provisioned.');
  }

  const selectedPermissions = Array.isArray(permissions)
    ? [...new Set(permissions)].filter((permission) => ADMIN_PERMISSIONS.includes(permission))
    : ADMIN_PERMISSIONS;
  if (role === 'admin' && selectedPermissions.length === 0) {
    throw new Error('Select at least one administrator privilege.');
  }

  let authUser;
  let createdAuthUser = false;
  try {
    authUser = await createSupabaseAuthUser({ email, password, role, firstName, lastName });
    createdAuthUser = true;
  } catch (error) {
    if (!(error instanceof SupabaseRequestError) || error.status !== 422) throw error;
    authUser = await getExistingAuthUser(email);
    if (!authUser || getText(authUser.user_metadata?.requested_role) !== role) throw error;
  }
  const user = await getApplicationUser(email);

  if (!user) {
    throw new SupabaseRequestError(
      'DATABASE_INVALID_RESPONSE',
      'The Agrisell user profile was not created for the new admin account.',
    );
  }

  const userId = getUserId(user.user_id);
  const existingAdmin = await getAdminRecord(userId);

  if (existingAdmin) {
    throw new SupabaseRequestError(
      'ADMIN_ALREADY_EXISTS',
      `An Agrisell administrator already exists for ${email}.`,
      409,
    );
  }

  if (!createdAuthUser) {
    await requestSupabaseAuth(`/auth/v1/admin/users/${encodeURIComponent(getText(authUser.id))}`, {
      body: JSON.stringify({ password }),
      headers: { 'Content-Type': 'application/json' },
      method: 'PUT',
    });
  }

  try {
    await insertSupabaseRow('admins', {
      admin_code: role === 'super_admin' ? 'AGRI-SA' : 'AGRI-ADMIN',
      admin_role: role,
      assigned_by_user_id: assignedByUserId || null,
      date_assigned: new Date().toISOString(),
      user_id: userId,
    });
    await insertSupabaseRow('admin_roles', {
      description: role === 'super_admin'
        ? 'Full Agrisell administration access.'
        : `Privileges: ${selectedPermissions.join(', ')}`,
      role_level: role === 'super_admin' ? 100 : 50,
      role_name: role === 'super_admin' ? 'Super administrator' : 'Administrator',
      user_id: userId,
    });
  } catch (error) {
    if (createdAuthUser) {
      await requestSupabaseAuth(`/auth/v1/admin/users/${encodeURIComponent(getText(authUser.id))}`, {
        method: 'DELETE',
      }).catch(() => undefined);
    }
    throw error;
  }

  return { email, permissions: selectedPermissions, userId };
};

module.exports = {
  authenticateSupabaseAdminCredentials,
  createSupabaseAuthUser,
  isSupabaseAdminEmail,
  provisionAdminAccount,
};
