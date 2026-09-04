const {
  approveAdminFarmer,
  approveAdminRider,
  createDashboardUser,
  createAdminSale,
  createAdministrator,
  deleteAdminSale,
  getAdminSales,
  getAdminDashboard,
  updateAdminSaleEnabled,
  updateAdminProfile,
  updateAdministratorPrivileges,
} = require('../controllers/adminDashboardController');
const { sendJson } = require('../utils/http');

const requirePermission = (request, response, permission) => {
  if (request.admin.permissions.includes(permission) || request.admin.permissions.includes('admin:manage')) return true;
  sendJson(response, 403, {
    code: 'ADMIN_PRIVILEGE_REQUIRED',
    message: 'Your administrator account does not have permission for this action.',
  });
  return false;
};

const routeAdminRequest = async (request, response, pathname) => {
  if (pathname === '/api/admin/profile' && request.method === 'PATCH') {
    await updateAdminProfile(request, response);
    return true;
  }

  if (pathname === '/api/admin/administrators' && request.method === 'POST') {
    if (!request.admin.permissions.includes('admin:manage')) {
      sendJson(response, 403, {
        code: 'SUPER_ADMIN_REQUIRED',
        message: 'Only a super administrator can create administrator accounts.',
      });
      return true;
    }
    await createAdministrator(request, response);
    return true;
  }

  const administratorPrivilegesMatch = pathname.match(
    /^\/api\/admin\/administrators\/([^/]+)\/privileges$/,
  );
  if (administratorPrivilegesMatch && request.method === 'PATCH') {
    if (!request.admin.permissions.includes('admin:manage')) {
      sendJson(response, 403, {
        code: 'SUPER_ADMIN_REQUIRED',
        message: 'Only a super administrator can update administrator privileges.',
      });
      return true;
    }
    await updateAdministratorPrivileges(
      request,
      response,
      decodeURIComponent(administratorPrivilegesMatch[1]),
    );
    return true;
  }

  if (pathname === '/api/admin/dashboard' && request.method === 'GET') {
    await getAdminDashboard(request, response);
    return true;
  }

  if (pathname === '/api/admin/users' && request.method === 'POST') {
    if (!requirePermission(request, response, 'users:manage')) return true;
    await createDashboardUser(request, response);
    return true;
  }
  if (pathname === '/api/admin/sales' && request.method === 'GET') {
    if (!requirePermission(request, response, 'sales:manage')) return true;
    await getAdminSales(request, response);
    return true;
  }
  if (pathname === '/api/admin/sales' && request.method === 'POST') {
    if (!requirePermission(request, response, 'sales:manage')) return true;
    await createAdminSale(request, response);
    return true;
  }
  const saleMatch = pathname.match(/^\/api\/admin\/sales\/([^/]+)$/);
  if (saleMatch && request.method === 'PATCH') {
    if (!requirePermission(request, response, 'sales:manage')) return true;
    await updateAdminSaleEnabled(request, response, decodeURIComponent(saleMatch[1]));
    return true;
  }
  if (saleMatch && request.method === 'DELETE') {
    if (!requirePermission(request, response, 'sales:manage')) return true;
    await deleteAdminSale(request, response, decodeURIComponent(saleMatch[1]));
    return true;
  }

  const approveFarmerMatch = pathname.match(
    /^\/api\/admin\/farmers\/([^/]+)\/approval$/,
  );

  if (approveFarmerMatch && request.method === 'PATCH') {
    if (!requirePermission(request, response, 'farmers:manage')) return true;
    await approveAdminFarmer(
      request,
      response,
      decodeURIComponent(approveFarmerMatch[1]),
    );
    return true;
  }

  const approveRiderMatch = pathname.match(
    /^\/api\/admin\/riders\/([^/]+)\/approval$/,
  );

  if (approveRiderMatch && request.method === 'PATCH') {
    if (!requirePermission(request, response, 'logistics:manage')) return true;
    await approveAdminRider(
      request,
      response,
      decodeURIComponent(approveRiderMatch[1]),
    );
    return true;
  }

  return false;
};

module.exports = { routeAdminRequest };
