import type { Admin, HandlerResult } from "../types.ts";
import {
  broadcastAnnouncement,
  getAudienceCounts,
  listBroadcastHistory,
} from "../services/broadcasts.ts";
import { requirePermission } from "./permission.ts";

export const handleBroadcastRoutes = async (
  request: Request,
  pathname: string,
  admin: Admin,
): Promise<HandlerResult | null> => {
  if (pathname === "/api/admin/broadcasts/audience-counts" && request.method === "GET") {
    const counts = await getAudienceCounts();
    return {
      status: 200,
      body: { counts },
    };
  }

  if (pathname === "/api/admin/broadcasts" && request.method === "GET") {
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
    const hasPermission =
      admin.permissions.includes("admin:manage") ||
      admin.permissions.includes("support:manage") ||
      admin.permissions.includes("users:manage");

    if (!hasPermission) {
      requirePermission(admin.permissions, "admin:manage");
    }

    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const result = await broadcastAnnouncement(admin.email, body);
    return {
      status: 201,
      body: result,
    };
  }

  return null;
};
