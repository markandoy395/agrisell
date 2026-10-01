const {
  SupabaseRequestError,
} = require('../services/supabaseService');
const {
  createReviewResponse, moderateReview,
} = require('../modules/admin/reviews/adminReviewService');
const { readJsonBody, sendJson } = require('../utils/http');
const { sendPersistenceError } = require('./adminControllerErrors');

const MODERATION_ACTIONS = new Set([
  'hide', 'publish', 'resolve_report', 'dismiss_report', 'reopen_report',
  'add_abuse_flag', 'remove_abuse_flag',
]);
const ABUSE_FLAGS = new Set([
  'spam', 'harassment', 'hate_speech', 'profanity', 'scam',
  'personal_information', 'other',
]);

const cleanText = (value, maximum) => {
  const result = typeof value === 'string' ? value.trim() : '';
  return result && result.length <= maximum ? result : '';
};

const createAdminReviewResponse = async (request, response, reviewType, reviewId) => {
  try {
    const body = await readJsonBody(request, { maxBytes: 4_000 });
    const message = cleanText(body.message, 1000);
    const mode = ['public', 'direct'].includes(body.mode) ? body.mode : '';
    if (!['farmer', 'rider'].includes(reviewType) || !reviewId || !mode ||
      !message || (mode === 'public' && message.length > 500)) {
      sendJson(response, 400, {
        code: 'INVALID_REVIEW_RESPONSE', message: 'Enter a valid review response.',
      });
      return;
    }
    const saved = await createReviewResponse({
      adminEmail: request.admin.email, message, mode, reviewId, reviewType,
    });
    if (saved === null) {
      sendJson(response, 404, {
        code: 'REVIEW_NOT_FOUND', message: 'The review could not be found.',
      });
      return;
    }
    sendJson(response, 201, { response: saved });
  } catch (error) {
    console.error('Unable to save the review response.', error);
    sendPersistenceError(
      response, error, 'REVIEW_RESPONSE_FAILED', 'The response could not be sent.',
    );
  }
};

const moderateAdminReview = async (request, response, reviewType, reviewId) => {
  try {
    const body = await readJsonBody(request, { maxBytes: 3_000 });
    const action = typeof body.action === 'string' ? body.action : '';
    const abuseFlag = typeof body.abuseFlag === 'string' ? body.abuseFlag : '';
    const note = cleanText(body.note, 500);
    const needsFlag = ['add_abuse_flag', 'remove_abuse_flag'].includes(action);
    if (!['farmer', 'rider'].includes(reviewType) || !reviewId ||
      !MODERATION_ACTIONS.has(action) || (needsFlag && !ABUSE_FLAGS.has(abuseFlag)) ||
      (typeof body.note === 'string' && body.note.trim() && !note)) {
      sendJson(response, 400, {
        code: 'INVALID_REVIEW_MODERATION',
        message: 'Enter a valid review moderation action.',
      });
      return;
    }
    const result = await moderateReview({
      abuseFlag: needsFlag ? abuseFlag : null,
      action,
      adminEmail: request.admin.email,
      note: note || null,
      reviewId,
      reviewType,
    });
    sendJson(response, 200, result);
  } catch (error) {
    console.error('Unable to moderate the review.', error);
    if (error instanceof SupabaseRequestError && /Review not found/i.test(error.message)) {
      sendJson(response, 404, {
        code: 'REVIEW_NOT_FOUND', message: 'The review could not be found.',
      });
      return;
    }
    sendPersistenceError(
      response, error, 'REVIEW_MODERATION_FAILED',
      'The review moderation change could not be saved.',
    );
  }
};

module.exports = { createAdminReviewResponse, moderateAdminReview };
