// Persists administrator review responses and moderation actions.
const {
  getSupabaseRows, insertSupabaseRow, requestSupabaseAuth,
} = require('../../../services/supabaseService');

const getReviewRecipient = async (reviewType, reviewId) => {
  if (reviewType === 'farmer') {
    const reviews = await getSupabaseRows('reviews', { review_id: `eq.${reviewId}` });
    if (!reviews[0]) return null;
    let buyerUserId = reviews[0].buyer_user_id;
    if (!buyerUserId && reviews[0].order_id) {
      const orders = await getSupabaseRows('orders', { order_id: `eq.${reviews[0].order_id}` });
      if (orders[0]?.cart_item_id) {
        const cartItems = await getSupabaseRows('cart_items', {
          cart_item_id: `eq.${orders[0].cart_item_id}`,
        });
        if (cartItems[0]?.cart_id) {
          const carts = await getSupabaseRows('carts', {
            cart_id: `eq.${cartItems[0].cart_id}`,
          });
          buyerUserId = carts[0]?.buyer_user_id;
        }
      }
    }
    if (!buyerUserId) return '';
    const buyers = await getSupabaseRows('buyers', {
      buyer_user_id: `eq.${buyerUserId}`,
    });
    const users = buyers[0]?.user_id
      ? await getSupabaseRows('users', { user_id: `eq.${buyers[0].user_id}` }) : [];
    return String(users[0]?.auth_user_id ?? '');
  }
  const reviews = await getSupabaseRows('rider_ratings', {
    rating_id: `eq.${reviewId}`,
  });
  return reviews[0] ? String(reviews[0].reviewer_auth_id ?? '') : null;
};

const createReviewResponse = async ({ adminEmail, message, mode, reviewId, reviewType }) => {
  const recipientAuthId = await getReviewRecipient(reviewType, reviewId);
  if (recipientAuthId === null) return null;
  const response = await insertSupabaseRow('admin_review_responses', {
    created_by_email: adminEmail,
    message,
    response_mode: mode,
    review_id: reviewId,
    review_type: reviewType,
  });
  if (recipientAuthId) {
    await insertSupabaseRow('notifications', {
      category: 'reviews', description: message, destination: 'reviews',
      metadata: { mode, review_id: reviewId, review_type: reviewType },
      notification_type: mode === 'direct'
        ? 'admin_direct_message' : 'admin_review_response',
      recipient_auth_user_id: recipientAuthId,
      title: mode === 'direct'
        ? 'Message from Agrisell support' : 'Agrisell replied to your review',
    });
  }
  return response;
};

const moderateReview = ({ abuseFlag, action, adminEmail, note, reviewId, reviewType }) =>
  requestSupabaseAuth('/rest/v1/rpc/admin_moderate_review', {
    body: JSON.stringify({
      p_abuse_flag: abuseFlag,
      p_action: action,
      p_actor_email: adminEmail,
      p_note: note,
      p_review_id: reviewId,
      p_review_type: reviewType,
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  });

module.exports = { createReviewResponse, moderateReview };
