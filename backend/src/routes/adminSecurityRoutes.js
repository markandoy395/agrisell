const controller = require('../controllers/adminSecurityController');
const { requirePermission } = require('./adminRoutePermission');

const routeAdminSecurity = async (request, response, pathname) => {
  if (pathname === '/api/admin/security' && request.method === 'GET') {
    await controller.securityOverview(request, response); return true;
  }
  if (pathname === '/api/admin/security/password' && request.method === 'POST') {
    await controller.password(request, response); return true;
  }
  if (pathname === '/api/admin/security/sessions/revoke-others' && request.method === 'POST') {
    await controller.revokeOthers(request, response); return true;
  }
  if (pathname === '/api/admin/security/mfa/enroll' && request.method === 'POST') {
    await controller.enrollMfa(request, response); return true;
  }
  if (pathname === '/api/admin/security/mfa/verify' && request.method === 'POST') {
    await controller.verifyMfa(request, response); return true;
  }
  const mfaFactorMatch = pathname.match(/^\/api\/admin\/security\/mfa\/factors\/([^/]+)$/);
  if (mfaFactorMatch && request.method === 'DELETE') {
    await controller.unenrollMfa(request, response, decodeURIComponent(mfaFactorMatch[1])); return true;
  }
  if (pathname === '/api/admin/requests' && request.method === 'POST') {
    await controller.submitRequest(request, response); return true;
  }
  const match = pathname.match(/^\/api\/admin\/administrators\/([^/]+)\/status$/);
  if (match && request.method === 'PATCH') {
    if (!requirePermission(request, response, 'admin:manage')) return true;
    await controller.updateAdministratorStatus(request, response, decodeURIComponent(match[1]));
    return true;
  }
  return false;
};

module.exports = { routeAdminSecurity };
