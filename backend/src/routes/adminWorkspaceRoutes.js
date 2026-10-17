const {
  createAdminManualRecord,
  createAdministrator,
  getAdminDashboard,
  getAdminPreferences,
  saveAdminPreferences,
  updateAdminProfile,
  updateAdministratorPrivileges,
} = require('../controllers/adminDashboardController');
const { requireAdminRole, requirePermission, requireSuperAdmin } = require('./adminRoutePermission');

const routeAdminWorkspace = async (request, response, pathname) => {
  if (pathname === '/api/admin/profile' && request.method === 'PATCH') {
    if (!requireAdminRole(request, response)) return true;
    await updateAdminProfile(request, response);
    return true;
  }
  if (pathname === '/api/admin/administrators' && request.method === 'POST') {
    if (!requireSuperAdmin(request, response, 'create administrator accounts')) return true;
    await createAdministrator(request, response);
    return true;
  }
  const privilegesMatch = pathname.match(
    /^\/api\/admin\/administrators\/([^/]+)\/privileges$/,
  );
  if (privilegesMatch && request.method === 'PATCH') {
    if (!requireSuperAdmin(request, response, 'update administrator privileges')) return true;
    await updateAdministratorPrivileges(
      request, response, decodeURIComponent(privilegesMatch[1]),
    );
    return true;
  }
  if (pathname === '/api/admin/dashboard' && request.method === 'GET') {
    if (!requireAdminRole(request, response)) return true;
    await getAdminDashboard(request, response);
    return true;
  }
  if (pathname === '/api/admin/preferences' && request.method === 'GET') {
    if (!requirePermission(request, response, 'settings:manage')) return true;
    await getAdminPreferences(request, response);
    return true;
  }
  if (pathname === '/api/admin/preferences' && request.method === 'PUT') {
    if (!requirePermission(request, response, 'settings:manage')) return true;
    await saveAdminPreferences(request, response);
    return true;
  }
  if (pathname === '/api/admin/records' && request.method === 'POST') {
    if (!requirePermission(request, response, 'logistics:manage')) return true;
    await createAdminManualRecord(request, response);
    return true;
  }
  return false;
};

module.exports = { routeAdminWorkspace };
