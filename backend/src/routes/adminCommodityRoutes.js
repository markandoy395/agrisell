const {
  createAdminCommodity,
  getAdminCommodities,
  updateAdminCommodityDetails,
  updateAdminCommodityStatus,
} = require('../controllers/adminCommodityController');
const { requirePermission } = require('./adminRoutePermission');

const routeAdminCommodity = async (request, response, pathname) => {
  if (pathname === '/api/admin/commodities' && request.method === 'GET') {
    if (!requirePermission(request, response, 'farmers:manage')) return true;
    await getAdminCommodities(request, response);
    return true;
  }
  if (pathname === '/api/admin/commodities' && request.method === 'POST') {
    if (!requirePermission(request, response, 'farmers:manage')) return true;
    await createAdminCommodity(request, response);
    return true;
  }

  const statusMatch = pathname.match(/^\/api\/admin\/commodities\/([^/]+)\/status$/);
  if (statusMatch && request.method === 'PATCH') {
    if (!requirePermission(request, response, 'farmers:manage')) return true;
    await updateAdminCommodityStatus(
      request, response, decodeURIComponent(statusMatch[1]),
    );
    return true;
  }
  const detailMatch = pathname.match(/^\/api\/admin\/commodities\/([^/]+)$/);
  if (detailMatch && request.method === 'PATCH') {
    if (!requirePermission(request, response, 'farmers:manage')) return true;
    await updateAdminCommodityDetails(
      request, response, decodeURIComponent(detailMatch[1]),
    );
    return true;
  }
  return false;
};

module.exports = { routeAdminCommodity };
