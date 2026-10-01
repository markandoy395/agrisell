const {
  getVerificationProfile,
  reviewVerification,
  setUserStatus,
  updateUser,
} = require('../services/adminAccountLifecycleService');
const { readJsonBody, sendJson } = require('../utils/http');
const { sendLifecycleError } = require('./adminControllerErrors');

const updateDashboardUser = async (request, response, userId) => {
  try {
    const user = await updateUser({
      actor: request.admin.email,
      input: await readJsonBody(request, { maxBytes: 8_000 }),
      userId,
    });
    sendJson(response, 200, { user });
  } catch (error) {
    console.error('Unable to update user profile.', error);
    sendLifecycleError(response, error, 'The user profile could not be saved.');
  }
};

const updateDashboardUserStatus = async (request, response, userId) => {
  try {
    const body = await readJsonBody(request, { maxBytes: 4_000 });
    const user = await setUserStatus({
      actor: request.admin.email,
      reason: body.reason,
      status: body.status,
      userId,
    });
    sendJson(response, 200, { user });
  } catch (error) {
    console.error('Unable to update user status.', error);
    sendLifecycleError(response, error, 'The account status could not be changed.');
  }
};

const getAdminVerification = async (_request, response, entityType, entityId) => {
  try {
    sendJson(response, 200, await getVerificationProfile(entityType, entityId));
  } catch (error) {
    console.error('Unable to load verification profile.', error);
    sendLifecycleError(response, error, 'The verification profile could not be loaded.');
  }
};

const reviewAdminVerification = async (request, response, entityType, entityId) => {
  try {
    const action = await reviewVerification({
      actor: request.admin.email,
      entityId,
      entityType,
      input: await readJsonBody(request, { maxBytes: 12_000 }),
    });
    sendJson(response, 200, { action });
  } catch (error) {
    console.error('Unable to save verification decision.', error);
    sendLifecycleError(response, error, 'The verification decision could not be saved.');
  }
};

module.exports = {
  getAdminVerification,
  reviewAdminVerification,
  updateDashboardUser,
  updateDashboardUserStatus,
};
