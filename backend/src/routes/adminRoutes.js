const {
  approveAdminFarmer,
  approveAdminRider,
  createDashboardUser,
  createAdminSale,
  deleteAdminSale,
  getAdminSales,
  getAdminDashboard,
  updateAdminSaleEnabled,
} = require('../controllers/adminDashboardController');

const routeAdminRequest = async (request, response, pathname) => {
  if (pathname === '/api/admin/dashboard' && request.method === 'GET') {
    await getAdminDashboard(request, response);
    return true;
  }

  if (pathname === '/api/admin/users' && request.method === 'POST') {
    await createDashboardUser(request, response);
    return true;
  }
  if (pathname === '/api/admin/sales' && request.method === 'GET') {
    await getAdminSales(request, response);
    return true;
  }
  if (pathname === '/api/admin/sales' && request.method === 'POST') {
    await createAdminSale(request, response);
    return true;
  }
  const saleMatch = pathname.match(/^\/api\/admin\/sales\/([^/]+)$/);
  if (saleMatch && request.method === 'PATCH') {
    await updateAdminSaleEnabled(request, response, decodeURIComponent(saleMatch[1]));
    return true;
  }
  if (saleMatch && request.method === 'DELETE') {
    await deleteAdminSale(request, response, decodeURIComponent(saleMatch[1]));
    return true;
  }

  const approveFarmerMatch = pathname.match(
    /^\/api\/admin\/farmers\/([^/]+)\/approval$/,
  );

  if (approveFarmerMatch && request.method === 'PATCH') {
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
