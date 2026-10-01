import type { Admin, HandlerResult } from "../types.ts";
import { createDashboardUser } from "../services/userCreation.ts";
import { updateUserProfile, updateUserStatus } from "../services/userLifecycle.ts";
import { requirePermission } from "./permission.ts";

export const handleUserRoutes = async (
  request: Request, pathname: string, admin: Admin,
): Promise<HandlerResult | null> => {
  if (request.method === "POST" && pathname === "/api/admin/users") {
    requirePermission(admin.permissions, "users:manage");
    const user = await createDashboardUser(await request.json().catch(() => null));
    return { status: 201, body: { user } };
  }
  const statusRoute = pathname.match(/^\/api\/admin\/users\/([^/]+)\/status$/);
  if (request.method === "PATCH" && statusRoute) {
    requirePermission(admin.permissions, "users:manage");
    const userId = decodeURIComponent(statusRoute[1]).replace(/^USR-/i, "");
    const user = await updateUserStatus(
      userId, await request.json().catch(() => null), admin,
    );
    return { status: 200, body: { user } };
  }
  const userRoute = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (request.method === "PATCH" && userRoute) {
    requirePermission(admin.permissions, "users:manage");
    const userId = decodeURIComponent(userRoute[1]).replace(/^USR-/i, "");
    const user = await updateUserProfile(
      userId, await request.json().catch(() => null), admin,
    );
    return { status: 200, body: { user } };
  }
  return null;
};
