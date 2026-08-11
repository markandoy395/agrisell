const { authenticateAdmin } = require('../middleware/authenticateAdmin');
const { getRequestPathname, sendJson } = require('../utils/http');
const { routeAdminRequest } = require('./adminRoutes');
const { routeAuthRequest } = require('./authRoutes');

const routeRequest = async (request, response) => {
  const pathname = getRequestPathname(request);

  if (request.method === 'GET' && pathname === '/api/health') {
    sendJson(response, 200, {
      service: 'agrisell-backend',
      status: 'ok',
    });
    return;
  }

  if (await routeAuthRequest(request, response, pathname)) {
    return;
  }

  if (pathname.startsWith('/api/')) {
    if (!authenticateAdmin(request, response)) {
      return;
    }

    if (await routeAdminRequest(request, response, pathname)) {
      return;
    }
  }

  sendJson(response, 404, { message: 'Route not found.' });
};

module.exports = { routeRequest };
