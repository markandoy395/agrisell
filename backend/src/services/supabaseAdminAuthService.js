const {
  SupabaseRequestError,
  getSupabaseRows,
  insertSupabaseRow,
  requestSupabaseAuth,
} = require('./supabaseService');
const { getPermissionsForAdminRole, getPublicAdmin } = require('./sessionService');

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

  return users.length === 1 ? users[0] : null;
};

const getAdminRecord = async (userId) => {
  const admins = await getSupabaseRows('admins', { user_id: `eq.${userId}` });

  return admins.length === 1 ? admins[0] : null;
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

    return {
      admin: getPublicAdmin({
        email,
        permissions: getPermissionsForAdminRole(adminRole),
      }),
      success: true,
    };
  } catch {
    return { reason: 'DATABASE_UNAVAILABLE', success: false };
  }
};

const createSupabaseAuthUser = async ({ email, password, role }) => {
  const body = await requestSupabaseAuth('/auth/v1/admin/users', {
    body: JSON.stringify({
      email,
      email_confirm: true,
      password,
      user_metadata: { requested_role: role },
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

const provisionAdminAccount = async ({ email, password, role }) => {
  if (!ADMIN_ROLES.has(role)) {
    throw new Error('Only admin and super_admin accounts can be provisioned.');
  }

  await createSupabaseAuthUser({ email, password, role });
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
    throw new Error(`An Agrisell administrator already exists for ${email}.`);
  }

  await insertSupabaseRow('admins', {
    admin_code: role === 'super_admin' ? 'AGRI-SA' : 'AGRI-ADMIN',
    admin_role: role,
    date_assigned: new Date().toISOString(),
    user_id: userId,
  });
  await insertSupabaseRow('admin_roles', {
    description:
      role === 'super_admin'
        ? 'Full Agrisell administration access.'
        : 'Agrisell administration access.',
    role_level: role === 'super_admin' ? 100 : 50,
    role_name: role === 'super_admin' ? 'Super administrator' : 'Administrator',
    user_id: userId,
  });
};

module.exports = {
  authenticateSupabaseAdminCredentials,
  createSupabaseAuthUser,
  isSupabaseAdminEmail,
  provisionAdminAccount,
};
