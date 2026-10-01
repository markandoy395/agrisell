import type { Admin, HandlerResult } from "../types.ts";
import { createReviewResponse, moderateReview, type ReviewType } from "../services/reviews.ts";
import { requirePermission } from "./permission.ts";

export const handleReviewRoutes = async (
  request: Request, pathname: string, admin: Admin,
): Promise<HandlerResult | null> => {
  const responseRoute = pathname.match(/^\/api\/admin\/reviews\/(farmer|rider)\/([^/]+)\/responses$/);
  if (responseRoute && request.method === "POST") {
    requirePermission(admin.permissions, "reviews:manage");
    const saved = await createReviewResponse(
      responseRoute[1] as ReviewType, decodeURIComponent(responseRoute[2]),
      await request.json().catch(() => null), admin,
    );
    return { status: 201, body: { response: saved } };
  }
  const moderationRoute = pathname.match(/^\/api\/admin\/reviews\/(farmer|rider)\/([^/]+)\/moderation$/);
  if (moderationRoute && request.method === "POST") {
    requirePermission(admin.permissions, "reviews:manage");
    const result = await moderateReview(
      moderationRoute[1] as ReviewType, decodeURIComponent(moderationRoute[2]),
      await request.json().catch(() => null), admin,
    );
    return { status: 200, body: result };
  }
  return null;
};
