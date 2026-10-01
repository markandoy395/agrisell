const {
  createAdminCategory,
  getAdminCategories,
  reorderAdminCategories,
  updateAdminCategory,
  updateAdminCategoryStatus,
} = require('../controllers/adminCategoryController');
const { requirePermission } = require('./adminRoutePermission');

const routeAdminCategory = async (request, response, pathname) => {
  if (pathname === '/api/admin/categories' && request.method === 'GET') {
    if (!requirePermission(request, response, 'farmers:manage')) return true;
    await getAdminCategories(request, response);
    return true;
  }
  if (pathname === '/api/admin/categories' && request.method === 'POST') {
    if (!requirePermission(request, response, 'farmers:manage')) return true;
    await createAdminCategory(request, response);
    return true;
  }
  if (
    pathname === '/api/admin/categories/reorder' &&
    (request.method === 'PUT' || request.method === 'POST')
  ) {
    if (!requirePermission(request, response, 'farmers:manage')) return true;
    await reorderAdminCategories(request, response);
    return true;
  }
  const statusMatch = pathname.match(/^\/api\/admin\/categories\/([^/]+)\/status$/);
  if (statusMatch && request.method === 'PATCH') {
    if (!requirePermission(request, response, 'farmers:manage')) return true;
    await updateAdminCategoryStatus(
      request, response, decodeURIComponent(statusMatch[1]),
    );
    return true;
  }
  const detailMatch = pathname.match(/^\/api\/admin\/categories\/([^/]+)$/);
  if (detailMatch && request.method === 'PATCH') {
    if (!requirePermission(request, response, 'farmers:manage')) return true;
    await updateAdminCategory(
      request, response, decodeURIComponent(detailMatch[1]),
    );
    return true;
  }
  return false;
};

module.exports = { routeAdminCategory };
