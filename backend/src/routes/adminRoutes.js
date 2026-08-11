const {
  approveAdminFarmer,
  approveAdminRider,
  createDashboardUser,
  getAdminDashboard,
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
