const { config } = require('../config/environment');
const {
  createAdminSession,
  getAdminSessions,
  revokeAdminSessions,
} = require('../services/sessionService');
const { getSessionCookie } = require('../modules/auth/authSessionCookie');
const { readJsonBody } = require('../utils/http');
const { sendJson } = require('../utils/http');
const {
  changePassword,
  createRequest,
  getSecurityEvents,
  recordSecurityEvent,
  setAdministratorEnabled,
} = require('../modules/admin/security/adminSecurityService');

const password = async (request, response) => {
  const body = await readJsonBody(request, { maxBytes: 3_000 });
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
  if (newPassword.length < 12 || newPassword.length > 512 || currentPassword.length > 512) {
    return sendJson(response, 400, { code: 'INVALID_PASSWORD', message: 'Use a new password of at least 12 characters.' });
  }
  if (!config.hasSupabaseAdminAccess) {
    return sendJson(response, 409, { code: 'PASSWORD_MANAGED_BY_ENVIRONMENT', message: 'This account password is managed by the server environment.' });
  }
  if (!await changePassword(request.admin.email, currentPassword, newPassword)) {
    return sendJson(response, 401, { code: 'CURRENT_PASSWORD_INVALID', message: 'The current password is incorrect.' });
  }
  const token = await createAdminSession(request.admin);
  sendJson(response, 200, { changed: true }, { 'Set-Cookie': getSessionCookie(token) });
};

const submitRequest = async (request, response) => {
  const body = await readJsonBody(request, { maxBytes: 12_000 });
  const type = body.type === 'feature' ? 'feature' : body.type === 'support' ? 'support' : '';
  const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!type || !subject || !message || subject.length > 160 || message.length > 5_000) {
    return sendJson(response, 400, { code: 'INVALID_REQUEST', message: 'Enter a subject and message before submitting.' });
  }
  sendJson(response, 201, { request: await createRequest(request.admin.email, type, subject, message) });
};

const securityOverview = async (request, response) => {
  const currentId = request.admin.session?.id;
  const sessions = (await getAdminSessions(request.admin.email, currentId)).map((session) => ({
    current: session.current,
    expiresAt: new Date(session.expiresAt * 1000).toISOString(),
    id: session.id,
    issuedAt: new Date(session.issuedAt * 1000).toISOString(),
  }));
  const events = config.hasSupabaseAdminAccess
    ? await getSecurityEvents(request.admin.email, request.admin.permissions.includes('admin:manage'))
    : [];
  sendJson(response, 200, { events, mfaAvailable: false, mfaEnabled: false, mfaFactorId: null, sessions });
};

const revokeOthers = async (request, response) => {
  const revoked = await revokeAdminSessions(request.admin.email, request.admin.session?.id);
  if (config.hasSupabaseAdminAccess) await recordSecurityEvent(request.admin.email, 'sessions_revoked', `${revoked} other session(s) revoked.`);
  sendJson(response, 200, { revoked });
};

const updateAdministratorStatus = async (request, response, userId) => {
  const body = await readJsonBody(request, { maxBytes: 1_000 });
  if (typeof body.enabled !== 'boolean') return sendJson(response, 400, { code: 'INVALID_STATUS', message: 'Choose whether the administrator is enabled.' });
  const result = await setAdministratorEnabled(request.admin.email, userId, body.enabled);
  if (result.role !== 'admin') return sendJson(response, result.role === 'super_admin' ? 403 : 404, { code: 'ADMIN_STATUS_NOT_EDITABLE', message: result.role === 'super_admin' ? 'The super administrator cannot be disabled.' : 'Administrator not found.' });
  if (result.self) return sendJson(response, 409, { code: 'CANNOT_DISABLE_SELF', message: 'You cannot disable your own administrator account.' });
  sendJson(response, 200, result);
};

const enrollMfa = async (_request, response) => {
  sendJson(response, 409, { code: 'MFA_UNAVAILABLE', message: 'MFA requires Supabase authentication.' });
};

const verifyMfa = async (_request, response) => {
  sendJson(response, 409, { code: 'MFA_UNAVAILABLE', message: 'MFA requires Supabase authentication.' });
};

const unenrollMfa = async (_request, response) => {
  sendJson(response, 409, { code: 'MFA_UNAVAILABLE', message: 'MFA requires Supabase authentication.' });
};

module.exports = {
  enrollMfa,
  password,
  revokeOthers,
  securityOverview,
  submitRequest,
  unenrollMfa,
  updateAdministratorStatus,
  verifyMfa,
};
