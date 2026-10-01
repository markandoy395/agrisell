const {
  insertSupabaseRow, signSupabaseProfileImage, SupabaseRequestError,
} = require('./supabaseService');
const {
  ADMIN_PERMISSIONS,
  DEFAULT_ADMIN_PERMISSIONS,
  SUPER_ADMIN_PERMISSIONS,
  getPermissionsForAdminRole,
  getPublicAdmin,
} = require('./sessionService');
const {
  createSupabaseAuthUser,
  deleteAuthUser,
  getAdminRecord,
  getAdminRoleRecord,
  getApplicationUser,
  getAuthUser,
  getExistingAuthUser,
  getText,
  getUserId,
  updateAuthPassword,
} = require('../modules/shared/supabase/supabaseAdminAuthRepository');

const ADMIN_ROLES = new Set(['admin', 'super_admin']);

const getStoredPermissions = (admin, roleRecord) => {
  if (Array.isArray(admin?.permissions)) return admin.permissions;
  const description = getText(roleRecord?.description);
  if (!description.toLowerCase().startsWith('privileges:')) return undefined;
  return description.slice('privileges:'.length).split(',')
    .map((permission) => permission.trim()).filter(Boolean);
};

const getSupabaseAdminProfile = async (email) => {
  const user = await getApplicationUser(email);
  if (!user) return null;
  return {
    avatarUrl: await signSupabaseProfileImage(getText(user.profile_photo_url)) || undefined,
    email: getText(user.email) || email,
    name: [user.first_name, user.middle_name, user.last_name, user.extension_name]
      .map(getText).filter(Boolean).join(' '),
  };
};

const isSupabaseAdminEmail = async (email) => {
  const user = await getApplicationUser(email);
  if (!user) return false;
  const admin = await getAdminRecord(getUserId(user.user_id));
  return Boolean(admin && ADMIN_ROLES.has(getText(admin.admin_role).toLowerCase()));
};

const isSupabaseAdminEnabled = async (email) => {
  const user = await getApplicationUser(email);
  return Boolean(user && getText(user.account_status).toLowerCase() === 'active');
};

const authenticateSupabaseAdminCredentials = async (email, password) => {
  try {
    const authUser = await getAuthUser({ email, password });
    if (!authUser) return { reason: 'INVALID_CREDENTIALS', success: false };
  } catch (error) {
    if (error instanceof SupabaseRequestError && error.status === 400) {
      return { reason: 'INVALID_CREDENTIALS', success: false };
    }
    return { reason: 'DATABASE_UNAVAILABLE', success: false };
  }
  try {
    const user = await getApplicationUser(email);
    if (!user) return { reason: 'ADMIN_PERMISSION_REQUIRED', success: false };
    if (getText(user.account_status).toLowerCase() !== 'active') {
      return { reason: 'ADMIN_ACCOUNT_DISABLED', success: false };
    }
    const userId = getUserId(user.user_id);
    const admin = await getAdminRecord(userId);
    const adminRole = getText(admin?.admin_role).toLowerCase();
    if (!admin || !ADMIN_ROLES.has(adminRole)) {
      return { reason: 'ADMIN_PERMISSION_REQUIRED', success: false };
    }
    const roleRecord = await getAdminRoleRecord(userId);
    return {
      admin: getPublicAdmin({
        avatarUrl: await signSupabaseProfileImage(getText(user.profile_photo_url)) || undefined,
        email,
        name: [user.first_name, user.middle_name, user.last_name, user.extension_name]
          .map(getText).filter(Boolean).join(' '),
        permissions: getPermissionsForAdminRole(
          adminRole, getStoredPermissions(admin, roleRecord),
        ),
      }),
      success: true,
    };
  } catch {
    return { reason: 'DATABASE_UNAVAILABLE', success: false };
  }
};

const selectPermissions = (role, permissions) => {
  if (role === 'super_admin') return SUPER_ADMIN_PERMISSIONS;
  if (!Array.isArray(permissions)) return DEFAULT_ADMIN_PERMISSIONS;
  return [...new Set(permissions)]
    .filter((permission) => ADMIN_PERMISSIONS.includes(permission));
};

const createOrReuseAuthUser = async (details) => {
  try {
    return {
      authUser: await createSupabaseAuthUser(details),
      createdAuthUser: true,
    };
  } catch (error) {
    if (!(error instanceof SupabaseRequestError) || error.status !== 422) throw error;
    const authUser = await getExistingAuthUser(details.email);
    if (!authUser || getText(authUser.user_metadata?.requested_role) !== details.role) {
      throw error;
    }
    return { authUser, createdAuthUser: false };
  }
};

const saveAdminRecords = async ({ assignedByUserId, role, selectedPermissions, userId }) => {
  await insertSupabaseRow('admins', {
    admin_code: role === 'super_admin' ? 'AGRI-SA' : 'AGRI-ADMIN',
    admin_role: role,
    assigned_by_user_id: assignedByUserId || null,
    date_assigned: new Date().toISOString(),
    user_id: userId,
  });
  await insertSupabaseRow('admin_roles', {
    description: role === 'super_admin' ? 'Full Agrisell administration access.'
      : `Privileges: ${selectedPermissions.join(', ')}`,
    role_level: role === 'super_admin' ? 100 : 50,
    role_name: role === 'super_admin' ? 'Super administrator' : 'Administrator',
    user_id: userId,
  });
};

const provisionAdminAccount = async (details) => {
  if (!ADMIN_ROLES.has(details.role)) {
    throw new Error('Only admin and super_admin accounts can be provisioned.');
  }
  const selectedPermissions = selectPermissions(details.role, details.permissions);
  if (details.role === 'admin' && selectedPermissions.length === 0) {
    throw new Error('Select at least one administrator privilege.');
  }
  const { authUser, createdAuthUser } = await createOrReuseAuthUser(details);
  const user = await getApplicationUser(details.email);
  if (!user) {
    throw new SupabaseRequestError(
      'DATABASE_INVALID_RESPONSE',
      'The Agrisell user profile was not created for the new admin account.',
    );
  }
  const userId = getUserId(user.user_id);
  if (await getAdminRecord(userId)) {
    throw new SupabaseRequestError(
      'ADMIN_ALREADY_EXISTS',
      `An Agrisell administrator already exists for ${details.email}.`,
      409,
    );
  }
  const authUserId = getText(authUser.id);
  if (!createdAuthUser) await updateAuthPassword(authUserId, details.password);
  try {
    await saveAdminRecords({ ...details, selectedPermissions, userId });
  } catch (error) {
    if (createdAuthUser) await deleteAuthUser(authUserId).catch(() => undefined);
    throw error;
  }
  return { email: details.email, permissions: selectedPermissions, userId };
};

module.exports = {
  authenticateSupabaseAdminCredentials,
  createSupabaseAuthUser,
  getSupabaseAdminProfile,
  isSupabaseAdminEmail,
  isSupabaseAdminEnabled,
  provisionAdminAccount,
};
