import { isAdminRole } from "../roles.ts";
import { createApiError } from "../value.ts";

export const requireAdminRole = (admin: { role?: unknown } | null | undefined) => {
  if (!admin) {
    throw createApiError(
      "AUTHENTICATION_REQUIRED",
      "A valid admin session is required.",
      401,
    );
  }
  const role = typeof admin.role === "string" && admin.role ? admin.role : "admin";
  if (!isAdminRole(role)) {
    throw createApiError(
      "ADMIN_ROLE_REQUIRED",
      "Access denied. Administrator role is required for this action.",
      403,
    );
  }
};

export const requirePermission = (permissions: string[], permission: string) => {
  if (!permissions.includes(permission) && !permissions.includes("admin:manage")) {
    throw createApiError(
      "ADMIN_PRIVILEGE_REQUIRED",
      "Your administrator account does not have permission for this action.",
      403,
    );
  }
};

export const requireAnyPermission = (permissions: string[], allowedPermissions: string[]) => {
  if (
    !permissions.includes("admin:manage") &&
    !allowedPermissions.some((p) => permissions.includes(p))
  ) {
    throw createApiError(
      "ADMIN_PRIVILEGE_REQUIRED",
      "Your administrator account does not have permission for this action.",
      403,
    );
  }
};

export const requireSuperAdminRole = (
  admin: { role?: unknown; permissions?: string[] } | null | undefined,
  action = "perform this action",
) => {
  requireAdminRole(admin);
  const permissions = Array.isArray(admin?.permissions) ? admin.permissions : [];
  if (admin?.role !== "super_admin" && !permissions.includes("admin:manage")) {
    throw createApiError(
      "SUPER_ADMIN_REQUIRED",
      `Only a super administrator can ${action}.`,
      403,
    );
  }
};
