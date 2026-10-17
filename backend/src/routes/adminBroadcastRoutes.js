const {
  getAdminAudienceCounts,
  getAdminBroadcasts,
  sendAdminBroadcast,
} = require('../controllers/adminBroadcastController');
const { requireAnyPermission } = require('./adminRoutePermission');

const BROADCAST_PERMISSIONS = ['support:manage', 'users:manage'];

const routeAdminBroadcast = async (request, response, pathname) => {
  if (pathname === '/api/admin/broadcasts/audience-counts' && request.method === 'GET') {
    if (!requireAnyPermission(request, response, BROADCAST_PERMISSIONS)) {
      return true;
    }
    await getAdminAudienceCounts(request, response);
    return true;
  }

  if (pathname === '/api/admin/broadcasts') {
    if (request.method === 'GET') {
      if (!requireAnyPermission(request, response, BROADCAST_PERMISSIONS)) {
        return true;
      }
      const parsedUrl = new URL(request.url || '', 'http://localhost');
      await getAdminBroadcasts(request, response, parsedUrl);
      return true;
    }
    if (request.method === 'POST') {
      if (!requireAnyPermission(request, response, BROADCAST_PERMISSIONS)) {
        return true;
      }
      await sendAdminBroadcast(request, response);
      return true;
    }
  }

  return false;
};

module.exports = { routeAdminBroadcast };
