const { saveAdminProfile } = require('../modules/admin/accounts/adminProfileService');
const { readJsonBody, sendJson } = require('../utils/http');

const updateAdminProfile = async (request, response) => {
  try {
    const body = await readJsonBody(request, { maxBytes: 900_000 });
    const name = typeof body.name === 'string'
      ? body.name.trim().replace(/\s+/g, ' ') : '';
    const avatarUrl = typeof body.avatarUrl === 'string' ? body.avatarUrl.trim() : '';
    if (!name || name.length > 200) {
      sendJson(response, 400, {
        code: 'INVALID_ADMIN_PROFILE', message: 'Enter a valid profile name.',
      });
      return;
    }
    const profile = await saveAdminProfile({
      adminEmail: request.admin.email, avatarUrl, name,
    });
    if (!profile) {
      sendJson(response, 404, {
        code: 'ADMIN_PROFILE_NOT_FOUND',
        message: 'The administrator profile could not be found.',
      });
      return;
    }
    sendJson(response, 200, { profile });
  } catch (error) {
    console.error('Unable to update the administrator profile.', error);
    const statusCode = error.statusCode ?? error.status ?? 502;
    sendJson(response, statusCode, {
      code: error.code ?? 'ADMIN_PROFILE_UPDATE_FAILED',
      message: statusCode < 500
        ? error.message
        : 'The administrator profile could not be saved. Please try again.',
    });
  }
};

module.exports = { updateAdminProfile };
