const {
  AdminBroadcastError,
  broadcastAnnouncement,
  getAudienceCounts,
  listBroadcastHistory,
} = require('../services/adminBroadcastService');
const { SupabaseRequestError } = require('../services/supabaseService');
const { readJsonBody, sendJson } = require('../utils/http');

const broadcastError = (response, error) => {
  if (error instanceof AdminBroadcastError) {
    sendJson(response, error.statusCode, { code: error.code, message: error.message });
    return;
  }
  console.error('Unable to process broadcast.', error);
  sendJson(response, error instanceof SupabaseRequestError ? 503 : 500, {
    code: 'BROADCAST_FAILED',
    message: error.message || 'The announcement could not be broadcast. Please try again.',
  });
};

const sendAdminBroadcast = async (request, response) => {
  try {
    const body = await readJsonBody(request, { maxBytes: 100_000 });
    const adminEmail = request.admin?.email || 'admin@agrisell.com';
    const result = await broadcastAnnouncement({
      adminEmail,
      title: body.title,
      message: body.message,
      targetSegment: body.targetSegment,
      notificationType: body.notificationType,
      destination: body.destination,
      metadata: body.metadata,
    });
    sendJson(response, 201, result);
  } catch (error) {
    broadcastError(response, error);
  }
};

const getAdminBroadcasts = async (request, response, parsedUrl) => {
  try {
    const limitParam = parsedUrl?.searchParams?.get('limit');
    const offsetParam = parsedUrl?.searchParams?.get('offset');
    const limit = Math.max(1, Math.min(100, Number(limitParam) || 50));
    const offset = Math.max(0, Number(offsetParam) || 0);

    const result = await listBroadcastHistory({ limit, offset });
    sendJson(response, 200, result);
  } catch (error) {
    broadcastError(response, error);
  }
};

const getAdminAudienceCounts = async (_request, response) => {
  try {
    const counts = await getAudienceCounts();
    sendJson(response, 200, { counts });
  } catch (error) {
    broadcastError(response, error);
  }
};

module.exports = {
  getAdminAudienceCounts,
  getAdminBroadcasts,
  sendAdminBroadcast,
};
