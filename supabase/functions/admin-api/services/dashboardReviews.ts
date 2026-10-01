import type { Row } from "../types.ts";
import { display, id, name, number, text } from "../value.ts";

const ACTION_LABELS: Record<string, string> = {
  abuse_flag_added: "Abuse flag added", abuse_flag_removed: "Abuse flag removed",
  hidden: "Review hidden", published: "Review published",
  report_dismissed: "Report dismissed", report_reopened: "Report reopened",
  report_resolved: "Report resolved",
};

const getAdminFields = (tables: Record<string, Row[]>) => {
  const latest = new Map<string, Row>();
  const responses = new Map<string, Row[]>();
  [...tables.admin_review_responses]
    .sort((a, b) => text(b.created_at).localeCompare(text(a.created_at)))
    .forEach((item) => {
      const key = `${text(item.review_type)}:${id(item.review_id)}`;
      if (!latest.has(key)) latest.set(key, item);
      responses.set(key, [...(responses.get(key) ?? []), item]);
    });
  const moderation = new Map(tables.admin_review_moderation.map((item) => [
    `${text(item.review_type)}:${id(item.review_id)}`, item,
  ]));
  const events = new Map<string, Row[]>();
  tables.admin_review_moderation_events.forEach((item) => {
    const key = `${text(item.review_type)}:${id(item.review_id)}`;
    events.set(key, [...(events.get(key) ?? []), item]);
  });
  return (type: string, reviewId: string) => {
    const key = `${type}:${reviewId}`;
    const reply = latest.get(key);
    const mode = reply && text(reply.response_mode) === "direct" ? "direct" : "public";
    const state = moderation.get(key);
    const visibility = text(state?.visibility_status) === "hidden" ? "hidden" : "published";
    const savedReport = text(state?.report_status);
    const reportStatus = ["open", "resolved", "dismissed"].includes(savedReport)
      ? savedReport : "none";
    const responseHistory = (responses.get(key) ?? []).map((item) => {
      const responseMode = text(item.response_mode) === "direct" ? "direct" : "public";
      return {
        actor: text(item.created_by_email, "Administrator"), createdAt: text(item.created_at),
        eventType: responseMode === "direct" ? "direct_message" : "public_reply",
        label: responseMode === "direct" ? "Direct message sent" : "Public reply posted",
        message: text(item.message),
      };
    });
    const eventHistory = (events.get(key) ?? []).map((item) => ({
      actor: text(item.created_by_email, "Administrator"), createdAt: text(item.created_at),
      eventType: text(item.action), label: ACTION_LABELS[text(item.action)] ?? "Moderation updated",
      message: [text(item.abuse_flag).replaceAll("_", " "), text(item.note)]
        .filter(Boolean).join(" · "),
    }));
    return {
      ...(reply ? { adminResponse: text(reply.message), adminResponseMode: mode } : {}),
      abuseFlags: Array.isArray(state?.abuse_flags) ? state.abuse_flags : [],
      moderationHistory: [...responseHistory, ...eventHistory]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
      moderationVisibility: visibility,
      reportStatus,
      status: visibility === "hidden" ? "Hidden" : reportStatus === "open" ? "Reported"
        : reply ? (mode === "direct" ? "Messaged" : "Replied") : "Published",
      tone: visibility === "hidden" || reportStatus === "open" ? "orange" : "green",
    };
  };
};

export const createReviewRows = (
  tables: Record<string, Row[]>,
  indexes: Record<string, Map<string, Row>>,
) => {
  const adminFields = getAdminFields(tables);
  const buyerName = (buyerId: unknown, fallback = "Buyer") => {
    const buyer = indexes.buyersById.get(id(buyerId));
    const user = buyer ? indexes.usersById.get(id(buyer.user_id)) : undefined;
    return user ? name(user, fallback) : fallback;
  };
  const orderBuyerName = (orderId: string, fallback: string) => {
    const order = indexes.ordersById.get(orderId);
    const item = order ? indexes.cartItemsById.get(id(order.cart_item_id)) : undefined;
    const cart = item ? indexes.cartsById.get(id(item.cart_id)) : undefined;
    return cart ? buyerName(cart.buyer_user_id, fallback) : fallback;
  };
  const farmerReviews = tables.reviews.map((review) => {
    const order = indexes.ordersById.get(id(review.order_id));
    const cartItem = order ? indexes.cartItemsById.get(id(order.cart_item_id)) : undefined;
    const commodity = cartItem ? indexes.commoditiesById?.get(id(cartItem.commodity_id)) : undefined;
    const cart = cartItem ? indexes.cartsById.get(id(cartItem.cart_id)) : undefined;
    const farmerId = id(commodity?.farmer_user_id || review.farmer_user_id);
    const farmer = indexes.farmersByUserId.get(farmerId);
    const buyerUserId = cart?.buyer_user_id || review.buyer_user_id;
    const rating = number(review.rating);
    const comment = text(review.comment, "No written review");
    return {
      category: "Farmer review", comment, entityId: id(review.review_id),
      primary: buyerName(buyerUserId), rating,
      referenceLabel: `Order #AG-${id(review.order_id) || "record"}`,
      reviewDate: text(review.created_at),
      reviewedName: farmer ? name(farmer, `Farmer ${farmerId || "record"}`)
        : `Farmer ${farmerId || "not recorded"}`,
      reviewedType: "Farmer", secondary: comment, value: `${rating} / 5 rating`,
      ...adminFields("farmer", id(review.review_id)),
    };
  });
  const riderReviews = tables.rider_ratings.map((review) => {
    const deliveryId = id(review.delivery_id);
    const orderId = id(indexes.deliveriesById.get(deliveryId)?.order_id);
    const riderId = id(review.rider_id);
    const rider = indexes.ridersById.get(riderId);
    const reviewerRole = text(review.reviewer_role, "Reviewer");
    const reviewerFarmer = indexes.farmersByAuthId.get(id(review.reviewer_auth_id));
    const reviewer = reviewerRole.toLowerCase() === "farmer" && reviewerFarmer
      ? name(reviewerFarmer, "Farmer")
      : orderBuyerName(orderId, display(reviewerRole, "Reviewer"));
    const rating = number(review.rating);
    const comment = text(review.comment, "No written review");
    return {
      category: "Rider review", comment, entityId: id(review.rating_id), primary: reviewer,
      rating, referenceLabel: orderId
        ? `Delivery ${deliveryId || "record"} | Order #AG-${orderId}`
        : `Delivery ${deliveryId || "record"}`,
      reviewDate: text(review.created_at),
      reviewedName: rider ? name(rider, `Rider ${riderId || "record"}`)
        : `Rider ${riderId || "not recorded"}`,
      reviewedType: "Rider", secondary: comment, value: `${rating} / 5 rating`,
      ...adminFields("rider", id(review.rating_id)),
    };
  });
  return [...farmerReviews, ...riderReviews]
    .sort((a, b) => b.reviewDate.localeCompare(a.reviewDate));
};
