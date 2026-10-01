const {
  createAdminReviewResponse,
  moderateAdminReview,
} = require('../controllers/adminDashboardController');
const { requirePermission } = require('./adminRoutePermission');

const routeAdminReview = async (request, response, pathname) => {
  const responseMatch = pathname.match(
    /^\/api\/admin\/reviews\/(farmer|rider)\/([^/]+)\/responses$/,
  );
  if (responseMatch && request.method === 'POST') {
    if (!requirePermission(request, response, 'reviews:manage')) return true;
    await createAdminReviewResponse(
      request, response, responseMatch[1], decodeURIComponent(responseMatch[2]),
    );
    return true;
  }
  const moderationMatch = pathname.match(
    /^\/api\/admin\/reviews\/(farmer|rider)\/([^/]+)\/moderation$/,
  );
  if (moderationMatch && request.method === 'POST') {
    if (!requirePermission(request, response, 'reviews:manage')) return true;
    await moderateAdminReview(
      request, response, moderationMatch[1], decodeURIComponent(moderationMatch[2]),
    );
    return true;
  }
  return false;
};

module.exports = { routeAdminReview };
