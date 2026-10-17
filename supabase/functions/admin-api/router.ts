import { SERVICE_ROLE_KEY, SUPABASE_URL } from "./config.ts";
import { handleAdminWorkspaceRoutes } from "./handlers/adminWorkspace.ts";
import { handleAuthRoutes } from "./handlers/auth.ts";
import { handleBroadcastRoutes } from "./handlers/broadcasts.ts";
import { handleCategoryRoutes } from "./handlers/categories.ts";
import { handleCommodityRoutes } from "./handlers/commodities.ts";
import { handleProxyRoutes } from "./handlers/proxy.ts";
import { handleReviewRoutes } from "./handlers/reviews.ts";
import { handleSaleRoutes } from "./handlers/sales.ts";
import { handleUserRoutes } from "./handlers/users.ts";
import { handleVerificationRoutes } from "./handlers/verifications.ts";
import { isAdminRole } from "./roles.ts";
import { getAuthenticatedActor } from "./services/auth.ts";
import { enforceMutationRateLimit } from "./services/rateLimit.ts";
import type { HandlerResult } from "./types.ts";

const routes = [
  handleProxyRoutes,
  handleAdminWorkspaceRoutes,
  handleCommodityRoutes,
  handleCategoryRoutes,
  handleBroadcastRoutes,
  handleReviewRoutes,
  handleSaleRoutes,
  handleUserRoutes,
  handleVerificationRoutes,
];

export const routeRequest = async (request: Request): Promise<HandlerResult> => {
  const pathname = new URL(request.url).pathname.replace(/^.*\/admin-api/, "");
  const authResult = await handleAuthRoutes(request, pathname);
  if (authResult) return authResult;

  const authSession = await getAuthenticatedActor(request);
  const { admin, actor, status } = authSession;

  if (request.method === "GET" && pathname === "/api/auth/session") {
    return {
      status: 200,
      body: admin ? { admin, authenticated: true } : { authenticated: false },
    };
  }

  if (request.method === "POST" && pathname === "/api/auth/logout") {
    const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (token) {
      await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
        method: "POST",
      }).catch(() => null);
    }
    return { status: 200, body: { authenticated: false } };
  }

  if (status === "unauthenticated" || !actor) {
    return {
      status: 401,
      body: { code: "AUTHENTICATION_REQUIRED", message: "A valid admin session is required." },
    };
  }

  if (status === "authenticated_user" || !admin || !isAdminRole(admin.role)) {
    return {
      status: 403,
      body: {
        code: "ADMIN_ROLE_REQUIRED",
        message: "Access denied. Administrator role is required for this action.",
      },
    };
  }

  const rateLimitResponse = await enforceMutationRateLimit(request, admin);
  if (rateLimitResponse) return rateLimitResponse;

  for (const route of routes) {
    const result = await route(request, pathname, admin);
    if (result) return result;
  }

  return { status: 404, body: { message: "Route not found." } };
};
