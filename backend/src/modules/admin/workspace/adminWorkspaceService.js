// Persists administrator workspace settings and manual requests.
const {
  getSupabaseRows, insertSupabaseRow, upsertSupabaseRow,
} = require('../../../services/supabaseService');

const getWorkspacePreferences = async (adminEmail) => {
  const rows = await getSupabaseRows('admin_workspace_preferences', {
    admin_email: `eq.${adminEmail}`,
  });
  const preferences = rows[0];
  return {
    autoApprove: preferences?.auto_approve_verified_listings ?? true,
    digest: preferences?.daily_admin_digest ?? true,
  };
};

const saveWorkspacePreferences = async (adminEmail, preferences) => {
  await upsertSupabaseRow('admin_workspace_preferences', {
    admin_email: adminEmail,
    auto_approve_verified_listings: preferences.autoApprove,
    daily_admin_digest: preferences.digest,
    updated_at: new Date().toISOString(),
  });
  return preferences;
};

const createManualRecord = (adminEmail, section, name) =>
  insertSupabaseRow('admin_manual_records', {
    created_by_email: adminEmail,
    name,
    section,
  });

const createFarmerInformationRequest = async (adminEmail, farmerId) => {
  const farmers = await getSupabaseRows('farmers', {
    farmer_user_id: `eq.${farmerId}`,
  });
  const farmer = farmers[0];
  if (!farmer) return null;
  const request = await insertSupabaseRow('admin_farmer_information_requests', {
    farmer_user_id: farmerId,
    requested_by_email: adminEmail,
  });
  if (farmer.auth_user_id) {
    await insertSupabaseRow('notifications', {
      category: 'verification',
      description: 'Please review your farmer profile and submit the missing or outdated verification information.',
      destination: 'profile',
      metadata: { farmer_user_id: farmerId, request_id: request.request_id },
      notification_type: 'farmer_information_requested',
      recipient_auth_user_id: farmer.auth_user_id,
      title: 'More farmer information required',
    });
  }
  return request;
};

module.exports = {
  createFarmerInformationRequest,
  createManualRecord,
  getWorkspacePreferences,
  saveWorkspacePreferences,
};
