const {
  createFarmerInformationRequest,
  createManualRecord,
  getWorkspacePreferences,
  saveWorkspacePreferences,
} = require('../modules/admin/workspace/adminWorkspaceService');
const { readJsonBody, sendJson } = require('../utils/http');
const {
  isMissingAdminPersistenceTable,
  sendPersistenceError,
} = require('./adminControllerErrors');

const cleanText = (value, maximum) => {
  const result = typeof value === 'string' ? value.trim() : '';
  return result && result.length <= maximum ? result : '';
};

const getAdminPreferences = async (request, response) => {
  try {
    sendJson(response, 200, await getWorkspacePreferences(request.admin.email));
  } catch (error) {
    if (isMissingAdminPersistenceTable(error)) {
      sendJson(response, 200, {
        autoApprove: true, digest: true, persistenceAvailable: false,
      });
      return;
    }
    console.error('Unable to load workspace preferences.', error);
    sendJson(response, error.status ?? 502, {
      code: 'PREFERENCES_LOAD_FAILED',
      message: 'Workspace preferences could not be loaded.',
    });
  }
};

const saveAdminPreferences = async (request, response) => {
  try {
    const body = await readJsonBody(request, { maxBytes: 2_000 });
    if (typeof body.autoApprove !== 'boolean' || typeof body.digest !== 'boolean') {
      sendJson(response, 400, {
        code: 'INVALID_PREFERENCES',
        message: 'Both workspace preferences must be true or false.',
      });
      return;
    }
    const preferences = { autoApprove: body.autoApprove, digest: body.digest };
    sendJson(
      response, 200,
      await saveWorkspacePreferences(request.admin.email, preferences),
    );
  } catch (error) {
    console.error('Unable to save workspace preferences.', error);
    sendPersistenceError(
      response, error, 'PREFERENCES_SAVE_FAILED',
      'Workspace preferences could not be saved.',
    );
  }
};

const createAdminManualRecord = async (request, response) => {
  try {
    const body = await readJsonBody(request, { maxBytes: 3_000 });
    const name = cleanText(body.name, 200);
    if (!['Logistics Companies', 'Riders'].includes(body.section) || !name) {
      sendJson(response, 400, {
        code: 'INVALID_RECORD', message: 'Enter a valid rider draft name.',
      });
      return;
    }
    const record = await createManualRecord(request.admin.email, body.section, name);
    sendJson(response, 201, { record });
  } catch (error) {
    console.error('Unable to create the admin record.', error);
    sendPersistenceError(
      response, error, 'RECORD_CREATE_FAILED', 'The record could not be saved.',
    );
  }
};

const requestFarmerInformation = async (request, response, farmerId) => {
  try {
    const saved = await createFarmerInformationRequest(request.admin.email, farmerId);
    if (!saved) {
      sendJson(response, 404, {
        code: 'FARMER_NOT_FOUND', message: 'The farmer profile could not be found.',
      });
      return;
    }
    sendJson(response, 201, { request: saved });
  } catch (error) {
    console.error('Unable to request farmer information.', error);
    sendPersistenceError(
      response, error, 'FARMER_INFORMATION_REQUEST_FAILED',
      'The information request could not be sent.',
    );
  }
};

module.exports = {
  createAdminManualRecord,
  getAdminPreferences,
  requestFarmerInformation,
  saveAdminPreferences,
};
