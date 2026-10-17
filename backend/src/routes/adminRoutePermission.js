const { isAdminRole } = require('../config/roles');
const { sendJson } = require('../utils/http');

const requireAdminRole = (request, response) => {
  const actor = request.admin || request.user;
  if (!actor) {
    sendJson(response, 401, {
      code: 'AUTHENTICATION_REQUIRED',
      message: 'A valid admin session is required.',
    });
    return false;
  }

  const role = actor.role || 'admin';
  if (!isAdminRole(role)) {
    sendJson(response, 403, {
      code: 'ADMIN_ROLE_REQUIRED',
      message: 'Access denied. Administrator role is required for this action.',
    });
    return false;
  }

  return true;
};

const requirePermission = (request, response, permission) => {
  if (!requireAdminRole(request, response)) return false;

  const permissions = Array.isArray(request.admin?.permissions)
    ? request.admin.permissions
    : [];

  if (permissions.includes(permission) || permissions.includes('admin:manage')) {
    return true;
  }

  sendJson(response, 403, {
    code: 'ADMIN_PRIVILEGE_REQUIRED',
    message: 'Your administrator account does not have permission for this action.',
  });
  return false;
};

const requireAnyPermission = (request, response, allowedPermissions) => {
  if (!requireAdminRole(request, response)) return false;

  const permissions = Array.isArray(request.admin?.permissions)
    ? request.admin.permissions
    : [];

  if (
    permissions.includes('admin:manage') ||
    allowedPermissions.some((p) => permissions.includes(p))
  ) {
    return true;
  }

  sendJson(response, 403, {
    code: 'ADMIN_PRIVILEGE_REQUIRED',
    message: 'Your administrator account does not have permission for this action.',
  });
  return false;
};

const requireSuperAdmin = (request, response, action = 'perform this action') => {
  if (!requireAdminRole(request, response)) return false;

  const permissions = Array.isArray(request.admin?.permissions)
    ? request.admin.permissions
    : [];

  if (request.admin?.role === 'super_admin' || permissions.includes('admin:manage')) {
    return true;
  }

  sendJson(response, 403, {
    code: 'SUPER_ADMIN_REQUIRED',
    message: `Only a super administrator can ${action}.`,
  });
  return false;
};

module.exports = {
  requireAdminRole,
  requireAnyPermission,
  requirePermission,
  requireSuperAdmin,
};
