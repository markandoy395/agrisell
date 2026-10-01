const {
  getAdminAudienceCounts,
  getAdminBroadcasts,
  sendAdminBroadcast,
} = require('../controllers/adminBroadcastController');
const { sendJson } = require('../utils/http');

const requireAnyPermission = (request, response, allowedPermissions) => {
  const adminPermissions = request.admin?.permissions || [];
  if (
    adminPermissions.includes('admin:manage') ||
    allowedPermissions.some((p) => adminPermissions.includes(p))
  ) {
    return true;
  }
  sendJson(response, 403, {
    code: 'ADMIN_PRIVILEGE_REQUIRED',
    message: 'Your administrator account does not have permission for this action.',
  });
  return false;
};

const routeAdminBroadcast = async (request, response, pathname) => {
  if (pathname === '/api/admin/broadcasts/audience-counts' && request.method === 'GET') {
    await getAdminAudienceCounts(request, response);
    return true;
  }

  if (pathname === '/api/admin/broadcasts') {
    if (request.method === 'GET') {
      const parsedUrl = new URL(request.url || '', 'http://localhost');
      await getAdminBroadcasts(request, response, parsedUrl);
      return true;
    }
    if (request.method === 'POST') {
      if (!requireAnyPermission(request, response, ['support:manage', 'users:manage'])) {
        return true;
      }
      await sendAdminBroadcast(request, response);
      return true;
    }
  }

  return false;
};

module.exports = { routeAdminBroadcast };
