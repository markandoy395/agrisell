const { AccountLifecycleError } = require('../services/adminAccountLifecycleService');
const { SupabaseRequestError } = require('../services/supabaseService');
const { sendJson } = require('../utils/http');

const isMissingAdminPersistenceTable = (error) =>
  error instanceof SupabaseRequestError &&
  error.status === 404 &&
  /admin_(?:workspace_preferences|manual_records|review_responses|review_moderation|review_moderation_events|moderate_review|farmer_information_requests)/
    .test(error.message);

const sendLifecycleError = (response, error, fallback) => {
  const expected = error instanceof AccountLifecycleError;
  sendJson(response, expected ? error.statusCode : (error.status ?? 502), {
    code: expected ? error.code : (error.code ?? 'ACCOUNT_LIFECYCLE_FAILED'),
    message: expected || (error.status ?? 500) < 500 ? error.message : fallback,
  });
};

const sendPersistenceError = (response, error, code, fallbackMessage) => {
  const missingMigration = isMissingAdminPersistenceTable(error);
  sendJson(response, missingMigration ? 503 : (error.status ?? 502), {
    code: missingMigration ? 'ADMIN_PERSISTENCE_NOT_INSTALLED' : code,
    message: missingMigration
      ? 'Admin persistence is not installed. Apply the 20260914100000 and 20260915110000 admin persistence migrations.'
      : fallbackMessage,
  });
};

module.exports = {
  isMissingAdminPersistenceTable,
  sendLifecycleError,
  sendPersistenceError,
};
