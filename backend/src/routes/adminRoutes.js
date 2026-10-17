const { routeAdminAccount } = require('./adminAccountRoutes');
const { routeAdminApiProxy } = require('./adminApiProxyRoutes');
const { routeAdminApproval } = require('./adminApprovalRoutes');
const { routeAdminBroadcast } = require('./adminBroadcastRoutes');
const { routeAdminCategory } = require('./adminCategoryRoutes');
const { routeAdminCommodity } = require('./adminCommodityRoutes');
const { routeAdminReview } = require('./adminReviewRoutes');
const { routeAdminSale } = require('./adminSaleRoutes');
const { routeAdminWorkspace } = require('./adminWorkspaceRoutes');
const { routeAdminSecurity } = require('./adminSecurityRoutes');
const { requireAdminRole } = require('./adminRoutePermission');

const routeAdminRequest = async (request, response, pathname) => {
  if (!pathname.startsWith('/api/admin')) {
    return false;
  }

  if (!requireAdminRole(request, response)) {
    return true;
  }

  return (
    await routeAdminApiProxy(request, response, pathname) ||
    await routeAdminWorkspace(request, response, pathname) ||
    await routeAdminCommodity(request, response, pathname) ||
    await routeAdminCategory(request, response, pathname) ||
    await routeAdminBroadcast(request, response, pathname) ||
    await routeAdminSecurity(request, response, pathname) ||
    await routeAdminReview(request, response, pathname) ||
    await routeAdminAccount(request, response, pathname) ||
    await routeAdminSale(request, response, pathname) ||
    await routeAdminApproval(request, response, pathname)
  );
};

module.exports = { routeAdminRequest };
