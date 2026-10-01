import { createApiError } from "../value.ts";

export const requirePermission = (permissions: string[], permission: string) => {
  if (!permissions.includes(permission) && !permissions.includes("admin:manage")) {
    throw createApiError(
      "ADMIN_PRIVILEGE_REQUIRED",
      "Your administrator account does not have permission for this action.", 403,
    );
  }
};
