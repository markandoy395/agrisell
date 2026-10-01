const {
  createDashboardUser,
  getAdminVerification,
  reviewAdminVerification,
  updateDashboardUser,
  updateDashboardUserStatus,
} = require('../controllers/adminDashboardController');
const { requirePermission } = require('./adminRoutePermission');

const routeAdminAccount = async (request, response, pathname) => {
  if (pathname === '/api/admin/users' && request.method === 'POST') {
    if (!requirePermission(request, response, 'users:manage')) return true;
    await createDashboardUser(request, response);
    return true;
  }
  const userStatusMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/status$/);
  if (userStatusMatch && request.method === 'PATCH') {
    if (!requirePermission(request, response, 'users:manage')) return true;
    await updateDashboardUserStatus(
      request, response, decodeURIComponent(userStatusMatch[1]),
    );
    return true;
  }
  const userMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (userMatch && request.method === 'PATCH') {
    if (!requirePermission(request, response, 'users:manage')) return true;
    await updateDashboardUser(request, response, decodeURIComponent(userMatch[1]));
    return true;
  }
  const verificationMatch = pathname.match(
    /^\/api\/admin\/verifications\/(farmer|rider)\/([^/]+)$/,
  );
  if (verificationMatch && ['GET', 'PATCH'].includes(request.method)) {
    const entityType = verificationMatch[1];
    const permission = entityType === 'farmer' ? 'farmers:manage' : 'logistics:manage';
    if (!requirePermission(request, response, permission)) return true;
    const args = [request, response, entityType, decodeURIComponent(verificationMatch[2])];
    if (request.method === 'GET') await getAdminVerification(...args);
    else await reviewAdminVerification(...args);
    return true;
  }
  return false;
};

module.exports = { routeAdminAccount };
