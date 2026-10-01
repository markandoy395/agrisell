// Maps review and moderation records into dashboard rows.
const {
  createIndex, getId, getName, getNumber, getText, getTextArray, toDisplayText,
} = require('./adminDashboardValue');

const ACTION_LABELS = {
  abuse_flag_added: 'Abuse flag added',
  abuse_flag_removed: 'Abuse flag removed',
  hidden: 'Review hidden',
  published: 'Review published',
  report_dismissed: 'Report dismissed',
  report_reopened: 'Report reopened',
  report_resolved: 'Report resolved',
};

const groupReviewActivity = (data) => {
  const latestResponseByReview = new Map();
  const responsesByReview = new Map();
  [...data.reviewResponses]
    .sort((current, next) => getText(next.created_at).localeCompare(getText(current.created_at)))
    .forEach((response) => {
      const key = `${getText(response.review_type)}:${getId(response.review_id)}`;
      if (!latestResponseByReview.has(key)) latestResponseByReview.set(key, response);
      responsesByReview.set(key, [...(responsesByReview.get(key) ?? []), response]);
    });
  const moderationByReview = new Map(data.reviewModeration.map((state) => [
    `${getText(state.review_type)}:${getId(state.review_id)}`, state,
  ]));
  const eventsByReview = new Map();
  data.reviewModerationEvents.forEach((event) => {
    const key = `${getText(event.review_type)}:${getId(event.review_id)}`;
    eventsByReview.set(key, [...(eventsByReview.get(key) ?? []), event]);
  });
  return { eventsByReview, latestResponseByReview, moderationByReview, responsesByReview };
};

const createReviewAdminFields = (data) => {
  const activity = groupReviewActivity(data);
  return (reviewType, reviewId) => {
    const key = `${reviewType}:${reviewId}`;
    const response = activity.latestResponseByReview.get(key);
    const mode = response && getText(response.response_mode) === 'direct' ? 'direct' : 'public';
    const moderation = activity.moderationByReview.get(key);
    const visibility = getText(moderation?.visibility_status) === 'hidden' ? 'hidden' : 'published';
    const moderationStatus = getText(moderation?.report_status);
    const reportStatus = ['open', 'resolved', 'dismissed'].includes(moderationStatus)
      ? moderationStatus : 'none';
    const responseHistory = (activity.responsesByReview.get(key) ?? []).map((item) => {
      const responseMode = getText(item.response_mode) === 'direct' ? 'direct' : 'public';
      return {
        actor: getText(item.created_by_email, 'Administrator'),
        createdAt: getText(item.created_at),
        eventType: responseMode === 'direct' ? 'direct_message' : 'public_reply',
        label: responseMode === 'direct' ? 'Direct message sent' : 'Public reply posted',
        message: getText(item.message),
      };
    });
    const eventHistory = (activity.eventsByReview.get(key) ?? []).map((event) => ({
      actor: getText(event.created_by_email, 'Administrator'),
      createdAt: getText(event.created_at),
      eventType: getText(event.action),
      label: ACTION_LABELS[getText(event.action)] ?? 'Moderation updated',
      message: [getText(event.abuse_flag).replaceAll('_', ' '), getText(event.note)]
        .filter(Boolean).join(' · '),
    }));
    return {
      ...(response ? { adminResponse: getText(response.message), adminResponseMode: mode } : {}),
      abuseFlags: getTextArray(moderation?.abuse_flags),
      moderationHistory: [...responseHistory, ...eventHistory]
        .sort((current, next) => next.createdAt.localeCompare(current.createdAt)),
      moderationVisibility: visibility,
      reportStatus,
      status: visibility === 'hidden' ? 'Hidden'
        : reportStatus === 'open' ? 'Reported'
          : response ? (mode === 'direct' ? 'Messaged' : 'Replied') : 'Published',
      tone: visibility === 'hidden' || reportStatus === 'open' ? 'orange' : 'green',
    };
  };
};

const createReviewRows = (data, usersById) => {
  const buyersById = createIndex(data.buyers, 'buyer_user_id');
  const farmersById = createIndex(data.farmers, 'farmer_user_id');
  const farmersByAuthId = createIndex(data.farmers, 'auth_user_id');
  const ridersById = createIndex(data.riders, 'rider_id');
  const deliveriesById = createIndex(data.deliveries, 'delivery_id');
  const ordersById = createIndex(data.orders, 'order_id');
  const cartsById = createIndex(data.carts, 'cart_id');
  const cartItemsById = createIndex(data.cartItems, 'cart_item_id');
  const commoditiesById = createIndex(data.commodities, 'commodity_id');
  const adminFields = createReviewAdminFields(data);
  const getBuyerName = (buyerId, fallback = 'Buyer') => {
    const buyer = buyersById.get(getId(buyerId));
    const user = buyer ? usersById.get(getId(buyer.user_id)) : undefined;
    return user ? getName(user, fallback) : fallback;
  };
  const getOrderBuyerName = (orderId, fallback = 'Buyer') => {
    const order = ordersById.get(getId(orderId));
    const item = order ? cartItemsById.get(getId(order.cart_item_id)) : undefined;
    const cart = item ? cartsById.get(getId(item.cart_id)) : undefined;
    return cart ? getBuyerName(cart.buyer_user_id, fallback) : fallback;
  };
  const farmerRows = data.reviews.map((review) => {
    const order = ordersById.get(getId(review.order_id));
    const cartItem = order ? cartItemsById.get(getId(order.cart_item_id)) : undefined;
    const commodity = cartItem ? commoditiesById.get(getId(cartItem.commodity_id)) : undefined;
    const cart = cartItem ? cartsById.get(getId(cartItem.cart_id)) : undefined;
    const farmerId = getId(commodity?.farmer_user_id || review.farmer_user_id);
    const farmer = farmersById.get(farmerId);
    const buyerUserId = cart?.buyer_user_id || review.buyer_user_id;
    const rating = getNumber(review.rating);
    return {
      category: 'Farmer review', comment: getText(review.comment, 'No written review'),
      entityId: getId(review.review_id), primary: getBuyerName(buyerUserId, 'Buyer'),
      rating, referenceLabel: `Order #AG-${getId(review.order_id) || 'record'}`,
      reviewDate: getText(review.created_at),
      reviewedName: farmer ? getName(farmer, `Farmer ${farmerId || 'record'}`)
        : `Farmer ${farmerId || 'not recorded'}`,
      reviewedType: 'Farmer', secondary: getText(review.comment, 'No written review'),
      value: `${rating} / 5 rating`, ...adminFields('farmer', getId(review.review_id)),
    };
  });
  const riderRows = data.riderRatings.map((review) => {
    const deliveryId = getId(review.delivery_id);
    const orderId = getId(deliveriesById.get(deliveryId)?.order_id);
    const riderId = getId(review.rider_id);
    const rider = ridersById.get(riderId);
    const reviewerRole = getText(review.reviewer_role, 'Reviewer');
    const reviewerFarmer = farmersByAuthId.get(getId(review.reviewer_auth_id));
    const reviewerName = reviewerRole.toLowerCase() === 'farmer' && reviewerFarmer
      ? getName(reviewerFarmer, 'Farmer')
      : getOrderBuyerName(orderId, toDisplayText(reviewerRole, 'Reviewer'));
    const rating = getNumber(review.rating);
    return {
      category: 'Rider review', comment: getText(review.comment, 'No written review'),
      entityId: getId(review.rating_id), primary: reviewerName, rating,
      referenceLabel: orderId ? `Delivery ${deliveryId || 'record'} · Order #AG-${orderId}`
        : `Delivery ${deliveryId || 'record'}`,
      reviewDate: getText(review.created_at),
      reviewedName: rider ? getText(rider.full_name, getName(rider, `Rider ${riderId || 'record'}`))
        : `Rider ${riderId || 'not recorded'}`,
      reviewedType: 'Rider', secondary: getText(review.comment, 'No written review'),
      value: `${rating} / 5 rating`, ...adminFields('rider', getId(review.rating_id)),
    };
  });
  return [...farmerRows, ...riderRows]
    .sort((current, next) => next.reviewDate.localeCompare(current.reviewDate));
};

module.exports = { createReviewRows };
