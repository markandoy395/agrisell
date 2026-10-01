// Provides Supabase data access for administrator authentication.
const {
  SupabaseRequestError,
  getSupabaseRows,
  requestSupabaseAuth,
} = require('../../../services/supabaseService');

const getText = (value) => (typeof value === 'string' ? value.trim() : '');
const getUserId = (value) =>
  typeof value === 'number' || typeof value === 'string' ? String(value) : '';

const getAuthUser = async ({ email, password }) => {
  const body = await requestSupabaseAuth('/auth/v1/token?grant_type=password', {
    body: JSON.stringify({ email, password }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  return body && typeof body === 'object' && body.user && typeof body.user === 'object'
    ? body.user : null;
};

const getApplicationUser = async (email) => {
  const users = await getSupabaseRows('users', { email: `eq.${email}` });
  return users.sort((current, next) =>
    Number(next.user_id ?? 0) - Number(current.user_id ?? 0))[0] ?? null;
};

const getExistingAuthUser = async (email) => {
  const body = await requestSupabaseAuth('/auth/v1/admin/users?per_page=1000');
  const users = body && typeof body === 'object' && Array.isArray(body.users)
    ? body.users : [];
  return users.find((user) =>
    getText(user?.email).toLowerCase() === email.toLowerCase()) ?? null;
};

const getAdminRecord = async (userId) => {
  const admins = await getSupabaseRows('admins', { user_id: `eq.${userId}` });
  return admins.length === 1 ? admins[0] : null;
};

const getAdminRoleRecord = async (userId) => {
  const roles = await getSupabaseRows('admin_roles', { user_id: `eq.${userId}` });
  return roles[0] ?? null;
};

const createSupabaseAuthUser = async ({ email, password, role, firstName, lastName }) => {
  const body = await requestSupabaseAuth('/auth/v1/admin/users', {
    body: JSON.stringify({
      email,
      email_confirm: true,
      password,
      user_metadata: {
        first_name: firstName, last_name: lastName, requested_role: role,
      },
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });
  const user = body && typeof body === 'object' && body.user && typeof body.user === 'object'
    ? body.user : body;
  if (!user || typeof user !== 'object' || !getText(user.id)) {
    throw new SupabaseRequestError(
      'DATABASE_INVALID_RESPONSE',
      'Supabase did not return the new authentication user.',
    );
  }
  return user;
};

const updateAuthPassword = (authUserId, password) =>
  requestSupabaseAuth(`/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, {
    body: JSON.stringify({ password }),
    headers: { 'Content-Type': 'application/json' },
    method: 'PUT',
  });

const updateAuthUser = (authUserId, updates) =>
  requestSupabaseAuth(`/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, {
    body: JSON.stringify(updates),
    headers: { 'Content-Type': 'application/json' },
    method: 'PUT',
  });

const deleteAuthUser = (authUserId) =>
  requestSupabaseAuth(`/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, {
    method: 'DELETE',
  });

module.exports = {
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
  updateAuthUser,
};
