// Provides persistence and authentication access for account lifecycle workflows.
const { config } = require('../../../config/environment');
const {
  getSupabaseRows,
  requestSupabaseAuth,
} = require('../../../services/supabaseService');
const { AccountLifecycleError, id, text } = require('./adminAccountLifecycleValue');

const authUserByEmail = async (email) => {
  if (!email) return null;
  const body = await requestSupabaseAuth('/auth/v1/admin/users?per_page=1000');
  return (Array.isArray(body?.users) ? body.users : []).find(
    (candidate) => text(candidate?.email).toLowerCase() === email.toLowerCase(),
  ) ?? null;
};

const setAuthenticationEnabled = async (email, enabled) => {
  const authUser = await authUserByEmail(email);
  if (!authUser?.id) return null;
  await requestSupabaseAuth(`/auth/v1/admin/users/${encodeURIComponent(authUser.id)}`, {
    body: JSON.stringify({ ban_duration: enabled ? 'none' : '876000h' }),
    headers: { 'Content-Type': 'application/json' },
    method: 'PUT',
  });
  return authUser;
};

const setAuthenticationById = (authId, enabled) =>
  requestSupabaseAuth(`/auth/v1/admin/users/${encodeURIComponent(authId)}`, {
    body: JSON.stringify({ ban_duration: enabled ? 'none' : '876000h' }),
    headers: { 'Content-Type': 'application/json' },
    method: 'PUT',
  });

const getUser = async (userId) => {
  const normalizedId = id(userId);
  if (!normalizedId) {
    throw new AccountLifecycleError('INVALID_USER', 'A valid user ID is required.');
  }
  const users = await getSupabaseRows('users', { user_id: `eq.${normalizedId}` });
  if (!users[0]) {
    throw new AccountLifecycleError(
      'USER_NOT_FOUND', 'The user account could not be found.', 404,
    );
  }
  return users[0];
};

const ensureNotAdministrator = async (user) => {
  const admins = await getSupabaseRows('admins', { user_id: `eq.${user.user_id}` });
  if (admins.length) {
    throw new AccountLifecycleError(
      'ADMIN_ACCOUNT_PROTECTED',
      'Administrator accounts must be managed from Administrator Management.',
      409,
    );
  }
};

const getVerificationRecord = async (entityType, entityId) => {
  const key = entityType === 'farmer' ? 'farmer_user_id' : 'rider_id';
  const profiles = await getSupabaseRows(`${entityType}s`, { [key]: `eq.${id(entityId)}` });
  if (!profiles[0]) {
    throw new AccountLifecycleError(
      'PROFILE_NOT_FOUND', 'The verification profile could not be found.', 404,
    );
  }
  return profiles[0];
};

const signRiderDocument = async (document) => {
  const filePath = text(document.file_path);
  const { file_path: privatePath, ...safeDocument } = document;
  void privatePath;
  if (!filePath || filePath.includes('..') || filePath.startsWith('/') || filePath.includes('://')) {
    return safeDocument;
  }
  try {
    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
    const signed = await requestSupabaseAuth(
      `/storage/v1/object/sign/rider-documents/${encodedPath}`,
      {
        body: JSON.stringify({ expiresIn: 300 }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      },
    );
    const signedPath = signed?.signedURL ?? signed?.signedUrl ?? '';
    const signedUrl = typeof signedPath === 'string' && signedPath.startsWith('/object/sign/')
      ? `${config.supabaseUrl.replace(/\/$/, '')}/storage/v1${signedPath}` : signedPath;
    return { ...safeDocument, signed_url: signedUrl };
  } catch {
    return { ...safeDocument, signed_url: '' };
  }
};

const getVerificationDocuments = async (entityType, entityId) => {
  if (entityType !== 'rider') return [];
  const documents = await getSupabaseRows('rider_documents', { rider_id: `eq.${id(entityId)}` });
  return Promise.all(documents.map(signRiderDocument));
};

const getVerificationActions = (entityType, entityId) =>
  getSupabaseRows('admin_verification_actions', {
    entity_id: `eq.${id(entityId)}`,
    entity_type: `eq.${entityType}`,
  });

module.exports = {
  ensureNotAdministrator,
  getUser,
  getVerificationActions,
  getVerificationDocuments,
  getVerificationRecord,
  setAuthenticationById,
  setAuthenticationEnabled,
};
