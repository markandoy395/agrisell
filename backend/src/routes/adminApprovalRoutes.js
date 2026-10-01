const {
  approveAdminFarmer,
  approveAdminRider,
  requestFarmerInformation,
} = require('../controllers/adminDashboardController');
const { requirePermission } = require('./adminRoutePermission');

const routeAdminApproval = async (request, response, pathname) => {
  const farmerApproval = pathname.match(/^\/api\/admin\/farmers\/([^/]+)\/approval$/);
  if (farmerApproval && request.method === 'PATCH') {
    if (!requirePermission(request, response, 'farmers:manage')) return true;
    await approveAdminFarmer(
      request, response, decodeURIComponent(farmerApproval[1]),
    );
    return true;
  }
  const informationRequest = pathname.match(
    /^\/api\/admin\/farmers\/([^/]+)\/information-requests$/,
  );
  if (informationRequest && request.method === 'POST') {
    if (!requirePermission(request, response, 'farmers:manage')) return true;
    await requestFarmerInformation(
      request, response, decodeURIComponent(informationRequest[1]),
    );
    return true;
  }
  const riderApproval = pathname.match(/^\/api\/admin\/riders\/([^/]+)\/approval$/);
  if (riderApproval && request.method === 'PATCH') {
    if (!requirePermission(request, response, 'logistics:manage')) return true;
    await approveAdminRider(request, response, decodeURIComponent(riderApproval[1]));
    return true;
  }
  return false;
};

module.exports = { routeAdminApproval };
