// Orchestrates administrator account creation and privilege updates.
const { provisionAdminAccount } = require('../../../services/supabaseAdminAuthService');
const {
  getSupabaseRows, insertSupabaseRow, updateSupabaseRows,
} = require('../../../services/supabaseService');
const { invalidateAdminSessions } = require('../../../services/sessionService');

const createAdministrator = async ({ adminEmail, email, firstName, lastName, password, permissions }) => {
  const assigningUsers = await getSupabaseRows('users', { email: `eq.${adminEmail}` });
  return provisionAdminAccount({
    assignedByUserId: assigningUsers[0]?.user_id,
    email,
    firstName,
    lastName,
    password,
    permissions,
    role: 'admin',
  });
};

const updateAdministratorPrivileges = async (userId, permissions) => {
  const targetAdmins = await getSupabaseRows('admins', { user_id: `eq.${userId}` });
  const targetRole = String(targetAdmins[0]?.admin_role ?? '').trim().toLowerCase();
  if (targetRole !== 'admin') return { targetRole };
  const description = `Privileges: ${permissions.join(', ')}`;
  const roles = await updateSupabaseRows(
    'admin_roles', { user_id: `eq.${userId}` }, { description },
  );
  if (!roles.length) {
    await insertSupabaseRow('admin_roles', {
      description,
      role_level: 50,
      role_name: 'Administrator',
      user_id: userId,
    });
  }
  const users = await getSupabaseRows('users', { user_id: `eq.${userId}` });
  const targetEmail = String(users[0]?.email ?? '').trim().toLowerCase();
  if (targetEmail) await invalidateAdminSessions(targetEmail);
  return { permissions, targetRole, userId };
};

module.exports = { createAdministrator, updateAdministratorPrivileges };
