import { getOptionalTable, getTable, insertRow, insertRows } from "../repository.ts";
import type { Row } from "../types.ts";
import { createApiError, id, number, text } from "../value.ts";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isValidUuid = (val: unknown): boolean => typeof val === "string" && UUID_REGEX.test(val.trim());

const VALID_SEGMENTS = new Set(["all", "buyers", "farmers", "riders"]);
const VALID_TYPES = new Set(["announcement", "marketing", "system_update", "warning"]);
const VALID_DESTINATIONS = new Set(["none", "products", "orders", "deliveries", "account", "messages"]);

export const formatBroadcast = (row: Row) => ({
  broadcastId: id(row.broadcast_id ?? row.id),
  id: id(row.broadcast_id ?? row.id),
  title: text(row.title, "").trim(),
  message: text(row.message, "").trim(),
  targetSegment: text(row.target_segment, "all").trim().toLowerCase(),
  notificationType: text(row.notification_type, "announcement").trim().toLowerCase(),
  destination: text(row.destination, "none").trim().toLowerCase(),
  recipientCount: number(row.recipient_count, 0),
  sentByEmail: text(row.sent_by_email, "").trim(),
  metadata: row.metadata && typeof row.metadata === "object" ? (row.metadata as Record<string, unknown>) : {},
  createdAt: text(row.created_at, new Date().toISOString()),
});

export const resolveAudienceAuthUserIds = async (targetSegment = "all"): Promise<string[]> => {
  const [users, buyers, farmers, riders] = await Promise.all([
    getOptionalTable("users"),
    getOptionalTable("buyers"),
    getOptionalTable("farmers"),
    getOptionalTable("riders"),
  ]);

  const usersById = new Map<string, Row>();
  users.forEach((u) => {
    if (u.user_id !== undefined && u.user_id !== null) {
      usersById.set(id(u.user_id), u);
    }
  });

  const segment = targetSegment.trim().toLowerCase();
  const recipientIds = new Set<string>();

  const addRecipient = (rawId: unknown) => {
    if (isValidUuid(rawId)) {
      recipientIds.add(String(rawId).trim().toLowerCase());
    }
  };

  if (segment === "farmers") {
    farmers.forEach((f) => addRecipient(f.auth_user_id || f.auth_id));
    users.forEach((u) => {
      const role = text(u.account_role || u.role, "").toLowerCase();
      if (role === "farmer") addRecipient(u.auth_user_id);
    });
  } else if (segment === "riders") {
    riders.forEach((r) => addRecipient(r.auth_id || r.auth_user_id));
    users.forEach((u) => {
      const role = text(u.account_role || u.role, "").toLowerCase();
      if (role === "rider") addRecipient(u.auth_user_id);
    });
  } else if (segment === "buyers") {
    buyers.forEach((b) => {
      const matchedUser = usersById.get(id(b.user_id));
      if (matchedUser) addRecipient(matchedUser.auth_user_id);
    });
    users.forEach((u) => {
      const role = text(u.account_role || u.role, "").toLowerCase();
      if (role === "buyer" || role === "user") addRecipient(u.auth_user_id);
    });
  } else {
    // all
    users.forEach((u) => addRecipient(u.auth_user_id));
    farmers.forEach((f) => addRecipient(f.auth_user_id || f.auth_id));
    riders.forEach((r) => addRecipient(r.auth_id || r.auth_user_id));
    buyers.forEach((b) => {
      const matchedUser = usersById.get(id(b.user_id));
      if (matchedUser) addRecipient(matchedUser.auth_user_id);
    });
  }

  return Array.from(recipientIds);
};

export const getAudienceCounts = async () => {
  const [all, buyers, farmers, riders] = await Promise.all([
    resolveAudienceAuthUserIds("all"),
    resolveAudienceAuthUserIds("buyers"),
    resolveAudienceAuthUserIds("farmers"),
    resolveAudienceAuthUserIds("riders"),
  ]);

  return {
    all: all.length,
    buyers: buyers.length,
    farmers: farmers.length,
    riders: riders.length,
  };
};

export const broadcastAnnouncement = async (
  adminEmail: string,
  payload: Record<string, unknown>,
) => {
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  const targetSegment = typeof payload.targetSegment === "string" ? payload.targetSegment.trim().toLowerCase() : "all";
  const notificationType = typeof payload.notificationType === "string" ? payload.notificationType.trim().toLowerCase() : "announcement";
  const destination = typeof payload.destination === "string" ? payload.destination.trim().toLowerCase() : "none";
  const metadata = payload.metadata && typeof payload.metadata === "object" ? (payload.metadata as Record<string, unknown>) : {};

  if (!title) {
    throw createApiError("INVALID_TITLE", "Announcement title is required.", 400);
  }
  if (title.length > 150) {
    throw createApiError("TITLE_TOO_LONG", "Announcement title must be 150 characters or fewer.", 400);
  }
  if (!message) {
    throw createApiError("INVALID_MESSAGE", "Announcement message is required.", 400);
  }
  if (message.length > 2000) {
    throw createApiError("MESSAGE_TOO_LONG", "Announcement message must be 2000 characters or fewer.", 400);
  }
  if (!VALID_SEGMENTS.has(targetSegment)) {
    throw createApiError("INVALID_SEGMENT", `Invalid target segment "${targetSegment}".`, 400);
  }
  if (!VALID_TYPES.has(notificationType)) {
    throw createApiError("INVALID_TYPE", `Invalid notification type "${notificationType}".`, 400);
  }
  if (!VALID_DESTINATIONS.has(destination)) {
    throw createApiError("INVALID_DESTINATION", `Invalid destination "${destination}".`, 400);
  }

  const recipientIds = await resolveAudienceAuthUserIds(targetSegment);

  const batchSize = 50;
  for (let i = 0; i < recipientIds.length; i += batchSize) {
    const batch = recipientIds.slice(i, i + batchSize).map((recipientId) => ({
      recipient_auth_user_id: recipientId,
      title,
      description: message,
      notification_type: notificationType,
      category: "system",
      destination,
      metadata: {
        ...metadata,
        broadcast: true,
        broadcast_segment: targetSegment,
        sent_by_email: adminEmail || null,
        dispatched_at: new Date().toISOString(),
      },
    }));

    try {
      await insertRows("notifications", batch);
    } catch (err) {
      console.warn("Edge function batch insert notifications warning:", err);
    }
  }

  let broadcastRecord: Row;
  try {
    broadcastRecord = await insertRow("admin_broadcasts", {
      title,
      message,
      target_segment: targetSegment,
      notification_type: notificationType,
      destination,
      recipient_count: recipientIds.length,
      sent_by_email: adminEmail || "admin@agrisell.com",
      metadata,
    });
  } catch (err) {
    console.warn("Failed to insert admin_broadcasts in edge function:", err);
    broadcastRecord = {
      broadcast_id: Date.now(),
      title,
      message,
      target_segment: targetSegment,
      notification_type: notificationType,
      destination,
      recipient_count: recipientIds.length,
      sent_by_email: adminEmail || "admin@agrisell.com",
      metadata,
      created_at: new Date().toISOString(),
    };
  }

  return {
    broadcast: formatBroadcast(broadcastRecord),
    recipientCount: recipientIds.length,
  };
};

export const listBroadcastHistory = async (limit = 50, offset = 0) => {
  const rows = await getOptionalTable("admin_broadcasts");
  const sorted = rows.slice().sort((a, b) => {
    const timeA = new Date(text(a.created_at, "0")).getTime();
    const timeB = new Date(text(b.created_at, "0")).getTime();
    return timeB - timeA;
  });

  const paged = sorted.slice(offset, offset + limit);

  return {
    broadcasts: paged.map(formatBroadcast),
    totalCount: sorted.length,
  };
};
