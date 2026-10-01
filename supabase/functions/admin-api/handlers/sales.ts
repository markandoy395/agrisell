import type { Admin, HandlerResult } from "../types.ts";
import { createSale, getSales, removeSale, updateSale } from "../services/sales.ts";
import { requirePermission } from "./permission.ts";

export const handleSaleRoutes = async (
  request: Request, pathname: string, admin: Admin,
): Promise<HandlerResult | null> => {
  if (pathname === "/api/admin/sales" && request.method === "GET") {
    requirePermission(admin.permissions, "sales:manage");
    return { status: 200, body: await getSales() };
  }
  if (pathname === "/api/admin/sales" && request.method === "POST") {
    requirePermission(admin.permissions, "sales:manage");
    return {
      status: 201,
      body: { sale: await createSale(await request.json().catch(() => null)) },
    };
  }
  const route = pathname.match(/^\/api\/admin\/sales\/([^/]+)$/);
  if (!route) return null;
  requirePermission(admin.permissions, "sales:manage");
  const saleId = decodeURIComponent(route[1]);
  if (request.method === "PATCH") {
    return {
      status: 200,
      body: { sale: await updateSale(saleId, await request.json().catch(() => null)) },
    };
  }
  if (request.method === "DELETE") {
    await removeSale(saleId);
    return { status: 200, body: {} };
  }
  return null;
};
