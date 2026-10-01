const { sendJson } = require('../utils/http');

const requirePermission = (request, response, permission) => {
  if (request.admin.permissions.includes(permission) ||
    request.admin.permissions.includes('admin:manage')) return true;
  sendJson(response, 403, {
    code: 'ADMIN_PRIVILEGE_REQUIRED',
    message: 'Your administrator account does not have permission for this action.',
  });
  return false;
};

module.exports = { requirePermission };
