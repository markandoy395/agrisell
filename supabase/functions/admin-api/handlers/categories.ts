import type { Admin, HandlerResult } from "../types.ts";
import {
  createCategory,
  listCategories,
  reorderCategories,
  updateCategory,
} from "../services/categories.ts";
import { requirePermission } from "./permission.ts";

export const handleCategoryRoutes = async (
  request: Request,
  pathname: string,
  admin: Admin,
): Promise<HandlerResult | null> => {
  if (pathname === "/api/admin/categories" && request.method === "GET") {
    requirePermission(admin.permissions, "farmers:manage");
    return {
      status: 200,
      body: await listCategories(),
    };
  }

  if (pathname === "/api/admin/categories" && request.method === "POST") {
    requirePermission(admin.permissions, "farmers:manage");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const category = await createCategory(body);
    return {
      status: 201,
      body: { category },
    };
  }

  if (
    pathname === "/api/admin/categories/reorder" &&
    (request.method === "PUT" || request.method === "POST")
  ) {
    requirePermission(admin.permissions, "farmers:manage");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const orderedIds = Array.isArray(body?.orderedIds)
      ? (body.orderedIds as string[])
      : [];
    const result = await reorderCategories(orderedIds);
    return {
      status: 200,
      body: result,
    };
  }

  const statusMatch = pathname.match(/^\/api\/admin\/categories\/([^/]+)\/status$/);
  if (statusMatch && request.method === "PATCH") {
    requirePermission(admin.permissions, "farmers:manage");
    const categoryId = decodeURIComponent(statusMatch[1]);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const status = typeof body.status === "string" ? body.status : "";
    const category = await updateCategory(categoryId, { status });
    return {
      status: 200,
      body: { category },
    };
  }

  const detailMatch = pathname.match(/^\/api\/admin\/categories\/([^/]+)$/);
  if (detailMatch && request.method === "PATCH") {
    requirePermission(admin.permissions, "farmers:manage");
    const categoryId = decodeURIComponent(detailMatch[1]);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const category = await updateCategory(categoryId, body);
    return {
      status: 200,
      body: { category },
    };
  }

  return null;
};
