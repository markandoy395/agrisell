const {
  getSupabaseRows,
  insertSupabaseRow,
  updateSupabaseRows,
} = require('../../../services/supabaseService');
const {
  getApplicationUser,
  getExistingAuthUser,
  getText,
  updateAuthPassword,
} = require('../../shared/supabase/supabaseAdminAuthRepository');
const { authenticateSupabaseAdminCredentials } = require('../../../services/supabaseAdminAuthService');
const { invalidateAdminSessions } = require('../../../services/sessionService');

const recordSecurityEvent = async (email, action, detail = '') => {
  try {
    await insertSupabaseRow('admin_security_events', {
      action,
      actor_email: email,
      detail: String(detail).slice(0, 500),
    });
  } catch (error) {
    console.warn('Unable to record administrator security activity.', error);
  }
};

const getSecurityEvents = async (email, canManageAdmins) => {
  const rows = await getSupabaseRows(
    'admin_security_events',
    canManageAdmins ? { order: 'created_at.desc', limit: '100' }
      : { actor_email: `eq.${email}`, order: 'created_at.desc', limit: '100' },
  );
  return rows.map((row) => ({
    action: getText(row.action),
    actorEmail: getText(row.actor_email),
    createdAt: getText(row.created_at),
    detail: getText(row.detail),
    id: String(row.event_id ?? ''),
  }));
};

const changePassword = async (email, currentPassword, newPassword) => {
  const authenticated = await authenticateSupabaseAdminCredentials(email, currentPassword);
  if (!authenticated.success) return false;
  const authUser = await getExistingAuthUser(email);
  if (!authUser) return false;
  await invalidateAdminSessions(email);
  await updateAuthPassword(getText(authUser.id), newPassword);
  await recordSecurityEvent(email, 'password_changed', 'Administrator password changed.');
  return true;
};

const createRequest = async (email, type, subject, message) => {
  const saved = await insertSupabaseRow('admin_requests', {
    message,
    request_type: type,
    status: 'open',
    subject,
    submitted_by_email: email,
  });
  await recordSecurityEvent(email, `${type}_submitted`, subject);
  return { id: String(saved.request_id ?? ''), status: 'open' };
};

const setAdministratorEnabled = async (actorEmail, userId, enabled) => {
  const targetAdmins = await getSupabaseRows('admins', { user_id: `eq.${userId}` });
  const role = getText(targetAdmins[0]?.admin_role).toLowerCase();
  if (role !== 'admin') return { role };
  const targetUsers = await getSupabaseRows('users', { user_id: `eq.${userId}` });
  const targetEmail = getText(targetUsers[0]?.email);
  if (!targetEmail || targetEmail.toLowerCase() === actorEmail.toLowerCase()) {
    return { role, self: true };
  }
  await updateSupabaseRows('users', { user_id: `eq.${userId}` }, {
    account_status: enabled ? 'active' : 'disabled',
    updated_at: new Date().toISOString(),
  });
  await invalidateAdminSessions(targetEmail);
  await recordSecurityEvent(
    actorEmail,
    enabled ? 'administrator_enabled' : 'administrator_disabled',
    targetEmail,
  );
  return { enabled, role, targetEmail };
};

module.exports = {
  changePassword,
  createRequest,
  getSecurityEvents,
  recordSecurityEvent,
  setAdministratorEnabled,
};
