// Orchestrates farmer and rider verification workflows.
const {
  insertSupabaseRow, updateSupabaseRows,
} = require('../../../services/supabaseService');
const {
  getVerificationActions,
  getVerificationDocuments,
  getVerificationRecord,
  setAuthenticationById,
} = require('./adminAccountLifecycleRepository');
const {
  AccountLifecycleError, id, text,
} = require('./adminAccountLifecycleValue');
const {
  getProfileEdits, getStatusUpdates, parseDecision,
} = require('./adminVerificationDecision');

const validateEntity = (entityType, entityId) => {
  if (!['farmer', 'rider'].includes(entityType) || !id(entityId)) {
    throw new AccountLifecycleError(
      'INVALID_VERIFICATION', 'A valid farmer or rider is required.',
    );
  }
};

const getVerificationProfile = async (entityType, entityId) => {
  validateEntity(entityType, entityId);
  const profile = await getVerificationRecord(entityType, entityId);
  const documents = await getVerificationDocuments(entityType, entityId);
  const actions = await getVerificationActions(entityType, entityId);
  return { actions, documents, profile };
};


const updateDocuments = async (entityType, entityId, decisions) => {
  if (entityType !== 'rider' || !Array.isArray(decisions)) return;
  for (const decision of decisions) {
    const documentId = id(decision?.documentId);
    const status = text(decision?.status).toLowerCase();
    const reason = text(decision?.reason, 1000);
    if (!documentId || !['verified', 'rejected'].includes(status) ||
      (status === 'rejected' && !reason)) continue;
    await updateSupabaseRows(
      'rider_documents',
      { document_id: `eq.${documentId}`, rider_id: `eq.${id(entityId)}` },
      {
        rejection_reason: status === 'rejected' ? reason : null,
        updated_at: new Date().toISOString(),
        verification_status: status,
      },
    );
  }
};

const notifyProfileOwner = async (profile, entityType, decision) => {
  const recipientAuthId = text(profile.auth_user_id ?? profile.auth_id);
  if (!recipientAuthId || decision.action === 'profile_updated') return;
  const descriptions = {
    verified: `Your ${entityType} verification was approved.`,
    rejected: `Your ${entityType} verification was rejected: ${decision.reason}`,
    needs_information: decision.message,
    suspended: `Your ${entityType} account was suspended: ${decision.reason}`,
    deactivated: `Your ${entityType} account was deactivated: ${decision.reason}`,
    reactivated: `Your ${entityType} account was reactivated.`,
  };
  await insertSupabaseRow('notifications', {
    category: 'verification', description: descriptions[decision.action], destination: 'profile',
    metadata: {
      action: decision.action, entity_id: decision.entityId, entity_type: entityType,
      missing_items: decision.missingItems, reason: decision.reason || null,
    },
    notification_type: `${entityType}_verification_${decision.action}`,
    recipient_auth_user_id: recipientAuthId,
    title: decision.action === 'verified' ? 'Verification approved'
      : decision.action === 'rejected' ? 'Verification rejected'
        : decision.action === 'needs_information' ? 'More information required'
          : `Account ${decision.action}`,
  });
};

const reviewVerification = async ({ actor, entityType, entityId, input }) => {
  const decision = { ...parseDecision(input), entityId: id(entityId) };
  const { profile } = await getVerificationProfile(entityType, entityId);
  if (decision.action === 'reactivated' && text(profile.verification_status).toLowerCase() !== 'verified') {
    throw new AccountLifecycleError(
      'VERIFICATION_REQUIRED', `Approve this ${entityType} before reactivating the account.`, 409,
    );
  }
  const profileAuthId = text(profile.auth_user_id ?? profile.auth_id);
  if (profileAuthId && ['suspended', 'deactivated', 'reactivated'].includes(decision.action)) {
    await setAuthenticationById(profileAuthId, decision.action === 'reactivated');
  }
  const key = entityType === 'farmer' ? 'farmer_user_id' : 'rider_id';
  await updateSupabaseRows(`${entityType}s`, { [key]: `eq.${decision.entityId}` }, {
    ...getProfileEdits(entityType, input, profile),
    ...getStatusUpdates(entityType, decision.action, profile),
    updated_at: new Date().toISOString(),
  });
  await updateDocuments(entityType, entityId, input.documentDecisions);
  const saved = await insertSupabaseRow('admin_verification_actions', {
    action: decision.action, actor_email: actor, entity_id: decision.entityId,
    entity_type: entityType, message: decision.message || null,
    missing_items: decision.missingItems,
    previous_status: text(profile.verification_status ?? profile.employment_status).toLowerCase() || null,
    reason: decision.reason || null,
  });
  await notifyProfileOwner(profile, entityType, decision);
  return saved;
};

module.exports = { getVerificationProfile, reviewVerification };
