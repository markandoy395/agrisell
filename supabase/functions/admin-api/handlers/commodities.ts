import type { Admin, HandlerResult } from "../types.ts";
import {
  createCommodity,
  getCommoditiesCatalog,
  updateCommodityDetails,
  updateCommodityStatus,
} from "../services/commodities.ts";
import { requirePermission } from "./permission.ts";

export const handleCommodityRoutes = async (
  request: Request,
  pathname: string,
  admin: Admin,
): Promise<HandlerResult | null> => {
  if (pathname === "/api/admin/commodities" && request.method === "GET") {
    requirePermission(admin.permissions, "farmers:manage");
    return {
      status: 200,
      body: await getCommoditiesCatalog(),
    };
  }

  if (pathname === "/api/admin/commodities" && request.method === "POST") {
    requirePermission(admin.permissions, "farmers:manage");
    const body = await request.json().catch(() => null);
    const result = await createCommodity(body, admin);
    return {
      status: 201,
      body: result,
    };
  }


  const statusMatch = pathname.match(/^\/api\/admin\/commodities\/([^/]+)\/status$/);
  if (statusMatch && request.method === "PATCH") {
    requirePermission(admin.permissions, "farmers:manage");
    const commodityId = decodeURIComponent(statusMatch[1]);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const status = typeof body.status === "string" ? body.status : "";
    const result = await updateCommodityStatus(commodityId, status, admin);
    return {
      status: 200,
      body: result,
    };
  }

  const detailMatch = pathname.match(/^\/api\/admin\/commodities\/([^/]+)$/);
  if (detailMatch && request.method === "PATCH") {
    requirePermission(admin.permissions, "farmers:manage");
    const commodityId = decodeURIComponent(detailMatch[1]);
    const body = await request.json().catch(() => null);
    const result = await updateCommodityDetails(commodityId, body, admin);
    return {
      status: 200,
      body: result,
    };
  }

  return null;
};
