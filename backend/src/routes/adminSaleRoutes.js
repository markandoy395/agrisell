const {
  createAdminSale,
  deleteAdminSale,
  getAdminSales,
  updateAdminSaleEnabled,
} = require('../controllers/adminDashboardController');
const { requirePermission } = require('./adminRoutePermission');

const routeAdminSale = async (request, response, pathname) => {
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
    await updateAdminSaleEnabled(
      request, response, decodeURIComponent(saleMatch[1]),
    );
    return true;
  }
  if (saleMatch && request.method === 'DELETE') {
    if (!requirePermission(request, response, 'sales:manage')) return true;
    await deleteAdminSale(request, response, decodeURIComponent(saleMatch[1]));
    return true;
  }
  return false;
};

module.exports = { routeAdminSale };
