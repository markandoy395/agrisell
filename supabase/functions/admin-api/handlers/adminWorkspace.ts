import type { Admin, HandlerResult } from "../types.ts";
import { createAdministrator, updateAdministratorPrivileges } from "../services/adminManagement.ts";
import { getDashboard } from "../services/dashboard.ts";
import { filterDashboardByPermissions } from "../services/dashboardPermissions.ts";
import { updateAdminProfile } from "../services/profile.ts";
import { createManualRecord, getPreferences, savePreferences } from "../services/workspace.ts";
import { createApiError } from "../value.ts";
import { requirePermission } from "./permission.ts";
import {
  changePassword, revokeOtherSessions, securityOverview, setAdministratorEnabled,
  submitAdminRequest,
} from "../services/security.ts";

export const handleAdminWorkspaceRoutes = async (
  request: Request, pathname: string, admin: Admin,
): Promise<HandlerResult | null> => {
  if (request.method === "GET" && pathname === "/api/admin/security") {
    return { status: 200, body: await securityOverview(request, admin) };
  }
  if (request.method === "POST" && pathname === "/api/admin/security/password") {
    return { status: 200, body: await changePassword(request, admin, (await request.json().catch(() => ({}))) as Record<string, unknown>) };
  }
  if (request.method === "POST" && pathname === "/api/admin/security/sessions/revoke-others") {
    return { status: 200, body: await revokeOtherSessions(request, admin) };
  }
  if (request.method === "POST" && pathname === "/api/admin/requests") {
    return { status: 201, body: { request: await submitAdminRequest(admin, (await request.json().catch(() => ({}))) as Record<string, unknown>) } };
  }
  const status = pathname.match(/^\/api\/admin\/administrators\/([^/]+)\/status$/);
  if (request.method === "PATCH" && status) {
    if (!admin.permissions.includes("admin:manage")) throw createApiError("SUPER_ADMIN_REQUIRED", "Only a super administrator can change administrator status.", 403);
    return { status: 200, body: await setAdministratorEnabled(admin, decodeURIComponent(status[1]), (await request.json().catch(() => ({}))) as Record<string, unknown>) };
  }
  if (request.method === "PATCH" && pathname === "/api/admin/profile") {
    return { status: 200, body: { profile: await updateAdminProfile(await request.json().catch(() => null), admin) } };
  }
  if (request.method === "POST" && pathname === "/api/admin/administrators") {
    if (!admin.permissions.includes("admin:manage")) {
      throw createApiError("SUPER_ADMIN_REQUIRED", "Only a super administrator can create administrator accounts.", 403);
    }
    return { status: 201, body: { admin: await createAdministrator(await request.json().catch(() => null), admin) } };
  }
  const privileges = pathname.match(/^\/api\/admin\/administrators\/([^/]+)\/privileges$/);
  if (request.method === "PATCH" && privileges) {
    if (!admin.permissions.includes("admin:manage")) {
      throw createApiError("SUPER_ADMIN_REQUIRED", "Only a super administrator can update administrator privileges.", 403);
    }
    const result = await updateAdministratorPrivileges(
      decodeURIComponent(privileges[1]), await request.json().catch(() => null),
    );
    return { status: 200, body: result };
  }
  if (request.method === "GET" && pathname === "/api/admin/dashboard") {
    return {
      status: 200,
      body: filterDashboardByPermissions(await getDashboard(), admin.permissions),
    };
  }
  if (pathname === "/api/admin/preferences" && request.method === "GET") {
    requirePermission(admin.permissions, "settings:manage");
    return { status: 200, body: await getPreferences(admin) };
  }
  if (pathname === "/api/admin/preferences" && request.method === "PUT") {
    requirePermission(admin.permissions, "settings:manage");
    return { status: 200, body: await savePreferences(await request.json().catch(() => null), admin) };
  }
  if (pathname === "/api/admin/records" && request.method === "POST") {
    requirePermission(admin.permissions, "logistics:manage");
    return { status: 201, body: { record: await createManualRecord(await request.json().catch(() => null), admin) } };
  }
  return null;
};
