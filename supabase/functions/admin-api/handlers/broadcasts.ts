import type { Admin, HandlerResult } from "../types.ts";
import {
  broadcastAnnouncement,
  getAudienceCounts,
  listBroadcastHistory,
} from "../services/broadcasts.ts";
import { requireAdminRole, requireAnyPermission } from "./permission.ts";

const BROADCAST_PERMISSIONS = ["support:manage", "users:manage"];

export const handleBroadcastRoutes = async (
  request: Request,
  pathname: string,
  admin: Admin,
): Promise<HandlerResult | null> => {
  if (pathname === "/api/admin/broadcasts/audience-counts" && request.method === "GET") {
    requireAdminRole(admin);
    requireAnyPermission(admin.permissions, BROADCAST_PERMISSIONS);
    const counts = await getAudienceCounts();
    return {
      status: 200,
      body: { counts },
    };
  }

  if (pathname === "/api/admin/broadcasts" && request.method === "GET") {
    requireAdminRole(admin);
    requireAnyPermission(admin.permissions, BROADCAST_PERMISSIONS);
    const url = new URL(request.url);
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit")) || 50));
    const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
    const result = await listBroadcastHistory(limit, offset);
    return {
      status: 200,
      body: result,
    };
  }

  if (pathname === "/api/admin/broadcasts" && request.method === "POST") {
    requireAdminRole(admin);
    requireAnyPermission(admin.permissions, BROADCAST_PERMISSIONS);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await broadcastAnnouncement(admin.email, body);
    return {
      status: 201,
      body: result,
    };
  }

  return null;
};
