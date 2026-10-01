const { getSupabaseRows, insertSupabaseRow, updateSupabaseRows } = require('./supabaseService');
const {
  ensureNotAdministrator,
  getUser,
  setAuthenticationEnabled,
} = require('../modules/admin/accounts/adminAccountLifecycleRepository');
const {
  AccountLifecycleError,
  text,
  USER_STATUSES,
} = require('../modules/admin/accounts/adminAccountLifecycleValue');
const {
  getVerificationProfile,
  reviewVerification,
} = require('../modules/admin/accounts/adminVerificationService');

const updateUser = async ({ actor, userId, input }) => {
  const user = await getUser(userId);
  await ensureNotAdministrator(user);
  const updates = {
    contact_number: text(input.contactNumber, 50) || null,
    date_of_birth: text(input.dateOfBirth, 10) || null,
    extension_name: text(input.extensionName, 30) || null,
    first_name: text(input.firstName, 100),
    gender: text(input.gender, 40) || null,
    last_name: text(input.lastName, 100),
    middle_name: text(input.middleName, 100) || null,
    updated_at: new Date().toISOString(),
  };
  if (!updates.first_name || !updates.last_name) {
    throw new AccountLifecycleError(
      'INVALID_USER_PROFILE', 'First and last name are required.',
    );
  }
  const updated = await updateSupabaseRows(
    'users', { user_id: `eq.${user.user_id}` }, updates,
  );
  await insertSupabaseRow('admin_account_lifecycle_events', {
    account_id: String(user.user_id),
    account_type: 'user',
    action: 'profile_updated',
    actor_email: actor,
    reason: text(input.reason, 1000) || null,
  });
  return updated[0];
};

const updateRelatedProfiles = async (authUserId, status) => {
  const farmers = await getSupabaseRows('farmers', { auth_user_id: `eq.${authUserId}` });
  if (farmers[0]) {
    await updateSupabaseRows(
      'farmers',
      { farmer_user_id: `eq.${farmers[0].farmer_user_id}` },
      { account_status: status, updated_at: new Date().toISOString() },
    );
  }
  const riders = await getSupabaseRows('riders', { auth_id: `eq.${authUserId}` });
  if (!riders[0]) return;
  const verified = text(riders[0].verification_status).toLowerCase() === 'verified';
  const employmentStatus = status === 'active' && verified ? 'active'
    : status === 'suspended' ? 'suspended' : 'inactive';
  await updateSupabaseRows(
    'riders',
    { rider_id: `eq.${riders[0].rider_id}` },
    {
      availability_status: employmentStatus === 'active'
        ? riders[0].availability_status : 'offline',
      employment_status: employmentStatus,
      updated_at: new Date().toISOString(),
    },
  );
};

const setUserStatus = async ({ actor, userId, status, reason }) => {
  const normalizedStatus = text(status).toLowerCase();
  const normalizedReason = text(reason, 1000);
  if (!USER_STATUSES.has(normalizedStatus)) {
    throw new AccountLifecycleError(
      'INVALID_ACCOUNT_STATUS', 'Choose active, suspended, or deactivated.',
    );
  }
  if (normalizedStatus !== 'active' && !normalizedReason) {
    throw new AccountLifecycleError(
      'REASON_REQUIRED', 'A reason is required to restrict an account.',
    );
  }
  const user = await getUser(userId);
  await ensureNotAdministrator(user);
  const previousStatus = text(user.account_status).toLowerCase() || 'active';
  if (previousStatus === normalizedStatus) return user;

  const authUser = await setAuthenticationEnabled(
    text(user.email), normalizedStatus === 'active',
  );
  const updated = await updateSupabaseRows(
    'users',
    { user_id: `eq.${user.user_id}` },
    { account_status: normalizedStatus, updated_at: new Date().toISOString() },
  );
  if (authUser?.id) await updateRelatedProfiles(authUser.id, normalizedStatus);
  await insertSupabaseRow('admin_account_lifecycle_events', {
    account_id: String(user.user_id),
    account_type: 'user',
    action: normalizedStatus,
    actor_email: actor,
    previous_status: previousStatus,
    reason: normalizedReason || null,
  });
  return updated[0];
};

module.exports = {
  AccountLifecycleError,
  getVerificationProfile,
  reviewVerification,
  setUserStatus,
  updateUser,
};
