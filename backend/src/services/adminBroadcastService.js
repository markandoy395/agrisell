const {
  getSupabaseRows,
  insertSupabaseRow,
  insertSupabaseRows,
} = require('./supabaseService');

class AdminBroadcastError extends Error {
  constructor(message, statusCode = 400, code = 'BROADCAST_ERROR') {
    super(message);
    this.name = 'AdminBroadcastError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isValidUuid = (val) => typeof val === 'string' && UUID_REGEX.test(val.trim());

const VALID_SEGMENTS = new Set(['all', 'buyers', 'farmers', 'riders']);
const VALID_TYPES = new Set(['announcement', 'marketing', 'system_update', 'warning']);
const VALID_DESTINATIONS = new Set(['none', 'products', 'orders', 'deliveries', 'account', 'messages']);

const formatBroadcast = (row) => ({
  broadcastId: String(row.broadcast_id ?? row.id ?? ''),
  id: String(row.broadcast_id ?? row.id ?? ''),
  title: String(row.title || '').trim(),
  message: String(row.message || '').trim(),
  targetSegment: String(row.target_segment || 'all').trim().toLowerCase(),
  notificationType: String(row.notification_type || 'announcement').trim().toLowerCase(),
  destination: String(row.destination || 'none').trim().toLowerCase(),
  recipientCount: Number(row.recipient_count) || 0,
  sentByEmail: String(row.sent_by_email || '').trim(),
  metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
  createdAt: row.created_at || new Date().toISOString(),
});

const resolveAudienceAuthUserIds = async (targetSegment = 'all') => {
  const [users, buyers, farmers, riders] = await Promise.all([
    getSupabaseRows('users').catch(() => []),
    getSupabaseRows('buyers').catch(() => []),
    getSupabaseRows('farmers').catch(() => []),
    getSupabaseRows('riders').catch(() => []),
  ]);

  const usersById = new Map();
  users.forEach((u) => {
    if (u.user_id !== undefined && u.user_id !== null) {
      usersById.set(String(u.user_id), u);
    }
  });

  const segment = targetSegment.trim().toLowerCase();
  const recipientIds = new Set();

  const addRecipient = (rawId) => {
    if (isValidUuid(rawId)) {
      recipientIds.add(rawId.trim().toLowerCase());
    }
  };

  if (segment === 'farmers') {
    farmers.forEach((f) => {
      addRecipient(f.auth_user_id || f.auth_id);
    });
    users.forEach((u) => {
      const role = String(u.account_role || u.role || '').toLowerCase();
      if (role === 'farmer') addRecipient(u.auth_user_id);
    });
  } else if (segment === 'riders') {
    riders.forEach((r) => {
      addRecipient(r.auth_id || r.auth_user_id);
    });
    users.forEach((u) => {
      const role = String(u.account_role || u.role || '').toLowerCase();
      if (role === 'rider') addRecipient(u.auth_user_id);
    });
  } else if (segment === 'buyers') {
    buyers.forEach((b) => {
      const matchedUser = usersById.get(String(b.user_id));
      if (matchedUser) addRecipient(matchedUser.auth_user_id);
    });
    users.forEach((u) => {
      const role = String(u.account_role || u.role || '').toLowerCase();
      if (role === 'buyer' || role === 'user') addRecipient(u.auth_user_id);
    });
  } else {
    // 'all'
    users.forEach((u) => addRecipient(u.auth_user_id));
    farmers.forEach((f) => addRecipient(f.auth_user_id || f.auth_id));
    riders.forEach((r) => addRecipient(r.auth_id || r.auth_user_id));
    buyers.forEach((b) => {
      const matchedUser = usersById.get(String(b.user_id));
      if (matchedUser) addRecipient(matchedUser.auth_user_id);
    });
  }

  return Array.from(recipientIds);
};

const getAudienceCounts = async () => {
  const [all, buyers, farmers, riders] = await Promise.all([
    resolveAudienceAuthUserIds('all'),
    resolveAudienceAuthUserIds('buyers'),
    resolveAudienceAuthUserIds('farmers'),
    resolveAudienceAuthUserIds('riders'),
  ]);

  return {
    all: all.length,
    buyers: buyers.length,
    farmers: farmers.length,
    riders: riders.length,
  };
};

const broadcastAnnouncement = async ({
  adminEmail,
  title,
  message,
  targetSegment = 'all',
  notificationType = 'announcement',
  destination = 'none',
  metadata = {},
}) => {
  const trimmedTitle = typeof title === 'string' ? title.trim() : '';
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';
  const segment = typeof targetSegment === 'string' ? targetSegment.trim().toLowerCase() : 'all';
  const type = typeof notificationType === 'string' ? notificationType.trim().toLowerCase() : 'announcement';
  const dest = typeof destination === 'string' ? destination.trim().toLowerCase() : 'none';

  if (!trimmedTitle) {
    throw new AdminBroadcastError('Announcement title is required.', 400, 'INVALID_TITLE');
  }
  if (trimmedTitle.length > 150) {
    throw new AdminBroadcastError('Announcement title must be 150 characters or fewer.', 400, 'TITLE_TOO_LONG');
  }
  if (!trimmedMessage) {
    throw new AdminBroadcastError('Announcement message is required.', 400, 'INVALID_MESSAGE');
  }
  if (trimmedMessage.length > 2000) {
    throw new AdminBroadcastError('Announcement message must be 2000 characters or fewer.', 400, 'MESSAGE_TOO_LONG');
  }
  if (!VALID_SEGMENTS.has(segment)) {
    throw new AdminBroadcastError(
      `Invalid target segment "${segment}". Must be one of: ${Array.from(VALID_SEGMENTS).join(', ')}.`,
      400,
      'INVALID_SEGMENT',
    );
  }
  if (!VALID_TYPES.has(type)) {
    throw new AdminBroadcastError(
      `Invalid notification type "${type}". Must be one of: ${Array.from(VALID_TYPES).join(', ')}.`,
      400,
      'INVALID_TYPE',
    );
  }
  if (!VALID_DESTINATIONS.has(dest)) {
    throw new AdminBroadcastError(
      `Invalid destination "${dest}". Must be one of: ${Array.from(VALID_DESTINATIONS).join(', ')}.`,
      400,
      'INVALID_DESTINATION',
    );
  }

  const recipientIds = await resolveAudienceAuthUserIds(segment);

  // Batch insert notifications into public.notifications
  const batchSize = 50;
  for (let i = 0; i < recipientIds.length; i += batchSize) {
    const batch = recipientIds.slice(i, i + batchSize).map((recipientId) => ({
      recipient_auth_user_id: recipientId,
      title: trimmedTitle,
      description: trimmedMessage,
      notification_type: type,
      category: 'system',
      destination: dest,
      metadata: {
        ...(metadata || {}),
        broadcast: true,
        broadcast_segment: segment,
        sent_by_email: adminEmail || null,
        dispatched_at: new Date().toISOString(),
      },
    }));

    await insertSupabaseRows('notifications', batch).catch((err) => {
      console.warn('Batch insert of broadcast notifications encountered a warning:', err.message);
    });
  }

  // Create audit record in public.admin_broadcasts
  let broadcastRecord;
  try {
    broadcastRecord = await insertSupabaseRow('admin_broadcasts', {
      title: trimmedTitle,
      message: trimmedMessage,
      target_segment: segment,
      notification_type: type,
      destination: dest,
      recipient_count: recipientIds.length,
      sent_by_email: adminEmail || 'admin@agrisell.com',
      metadata: metadata || {},
    });
  } catch (err) {
    console.warn('Failed to insert into admin_broadcasts table:', err.message);
    broadcastRecord = {
      broadcast_id: Date.now(),
      title: trimmedTitle,
      message: trimmedMessage,
      target_segment: segment,
      notification_type: type,
      destination: dest,
      recipient_count: recipientIds.length,
      sent_by_email: adminEmail || 'admin@agrisell.com',
      metadata: metadata || {},
      created_at: new Date().toISOString(),
    };
  }

  return {
    broadcast: formatBroadcast(broadcastRecord),
    recipientCount: recipientIds.length,
  };
};

const listBroadcastHistory = async ({ limit = 50, offset = 0 } = {}) => {
  let rows = [];
  try {
    rows = await getSupabaseRows('admin_broadcasts');
  } catch (err) {
    console.warn('Could not read admin_broadcasts:', err.message);
    rows = [];
  }

  const sorted = rows.slice().sort((a, b) => {
    const timeA = new Date(a.created_at || 0).getTime();
    const timeB = new Date(b.created_at || 0).getTime();
    return timeB - timeA;
  });

  const paged = sorted.slice(offset, offset + limit);

  return {
    broadcasts: paged.map(formatBroadcast),
    totalCount: sorted.length,
  };
};

module.exports = {
  AdminBroadcastError,
  broadcastAnnouncement,
  getAudienceCounts,
  listBroadcastHistory,
  resolveAudienceAuthUserIds,
};
