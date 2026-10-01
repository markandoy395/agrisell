import type { Admin, Row } from "../types.ts";
import { getTable, insertRow, requestSupabase } from "../repository.ts";
import { createApiError, id, text } from "../value.ts";

export type ReviewType = "farmer" | "rider";

const getRecipient = async (reviewType: ReviewType, reviewId: string) => {
  if (reviewType === "farmer") {
    const review = (await getTable("reviews", { review_id: `eq.${reviewId}` }))[0];
    if (!review) throw createApiError("REVIEW_NOT_FOUND", "The review could not be found.", 404);
    let buyerUserId = id(review.buyer_user_id);
    if (!buyerUserId && id(review.order_id)) {
      const order = (await getTable("orders", { order_id: `eq.${id(review.order_id)}` }))[0];
      if (order && id(order.cart_item_id)) {
        const cartItem = (await getTable("cart_items", { cart_item_id: `eq.${id(order.cart_item_id)}` }))[0];
        if (cartItem && id(cartItem.cart_id)) {
          const cart = (await getTable("carts", { cart_id: `eq.${id(cartItem.cart_id)}` }))[0];
          buyerUserId = id(cart?.buyer_user_id);
        }
      }
    }
    if (!buyerUserId) return "";
    const buyer = (await getTable("buyers", { buyer_user_id: `eq.${buyerUserId}` }))[0];
    const user = buyer ? (await getTable("users", { user_id: `eq.${id(buyer.user_id)}` }))[0] : undefined;
    return id(user?.auth_user_id);
  }
  const review = (await getTable("rider_ratings", { rating_id: `eq.${reviewId}` }))[0];
  if (!review) throw createApiError("REVIEW_NOT_FOUND", "The review could not be found.", 404);
  return id(review.reviewer_auth_id);
};

export const createReviewResponse = async (
  reviewType: ReviewType, reviewId: string, payload: unknown, admin: Admin,
) => {
  const body = payload as Row | null;
  const message = text(body?.message);
  const mode = body?.mode === "public" || body?.mode === "direct" ? body.mode : "";
  if (!message || message.length > (mode === "public" ? 500 : 1000) || !mode) {
    throw createApiError("INVALID_REVIEW_RESPONSE", "Enter a valid review response.", 400);
  }
  const recipientAuthId = await getRecipient(reviewType, reviewId);
  const saved = await insertRow("admin_review_responses", {
    created_by_email: admin.email, message, response_mode: mode,
    review_id: reviewId, review_type: reviewType,
  });
  if (recipientAuthId) {
    await insertRow("notifications", {
      category: "reviews", description: message, destination: "reviews",
      metadata: { mode, review_id: reviewId, review_type: reviewType },
      notification_type: mode === "direct" ? "admin_direct_message" : "admin_review_response",
      recipient_auth_user_id: recipientAuthId,
      title: mode === "direct" ? "Message from Agrisell support" : "Agrisell replied to your review",
    });
  }
  return saved;
};

export const moderateReview = async (
  reviewType: ReviewType, reviewId: string, payload: unknown, admin: Admin,
) => {
  const body = payload as Row | null;
  const action = text(body?.action);
  const abuseFlag = text(body?.abuseFlag);
  const note = text(body?.note);
  const actions = ["hide", "publish", "resolve_report", "dismiss_report", "reopen_report", "add_abuse_flag", "remove_abuse_flag"];
  const flags = ["spam", "harassment", "hate_speech", "profanity", "scam", "personal_information", "other"];
  const needsFlag = action === "add_abuse_flag" || action === "remove_abuse_flag";
  if (!actions.includes(action) || (needsFlag && !flags.includes(abuseFlag)) || note.length > 500) {
    throw createApiError("INVALID_REVIEW_MODERATION", "Enter a valid review moderation action.", 400);
  }
  return await requestSupabase("/rest/v1/rpc/admin_moderate_review", {
    body: JSON.stringify({
      p_abuse_flag: needsFlag ? abuseFlag : null, p_action: action,
      p_actor_email: admin.email, p_note: note || null,
      p_review_id: reviewId, p_review_type: reviewType,
    }),
    headers: { "Content-Type": "application/json" }, method: "POST",
  });
};
