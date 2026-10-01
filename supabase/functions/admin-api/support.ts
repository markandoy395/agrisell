// Shared by the Node backend and Supabase Edge Function.
type JsonRow = Record<string, unknown>;
type RequestDatabase = (path: string, init?: RequestInit) => Promise<unknown>;
type SupportRequest = {
  path: string;
  method: string;
  permissions: string[];
  actor: string;
  body?: unknown;
  query?: URLSearchParams;
};

const fail = (message: string, status = 400) =>
  Object.assign(new Error(message), { status, code: 'SUPPORT_REQUEST_FAILED' });

const row = (value: unknown): JsonRow =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRow)
    : {};

async function fetchFallbackSupportHub(
  database: RequestDatabase,
  rpc: (name: string, args?: Record<string, unknown>) => Promise<unknown>,
): Promise<JsonRow> {
  let deliveryChats: JsonRow[] = [];
  try {
    const rawMessages = await database(
      '/rest/v1/rider_delivery_messages?party=eq.support&select=delivery_id,sender_role,body,sent_at&order=sent_at.desc',
    );
    const messages = Array.isArray(rawMessages) ? rawMessages : [];
    if (messages.length > 0) {
      const seen = new Set<unknown>();
      const latestMessages: JsonRow[] = [];
      for (const msg of messages) {
        const m = row(msg);
        if (m.delivery_id && !seen.has(m.delivery_id)) {
          seen.add(m.delivery_id);
          latestMessages.push(m);
        }
      }

      const deliveryIds = latestMessages.map((m) => m.delivery_id).filter(Boolean);
      const [deliveries, assignments] = await Promise.all([
        deliveryIds.length > 0
          ? database(
              `/rest/v1/deliveries?delivery_id=in.(${deliveryIds.join(',')})&select=delivery_id,order_id,delivery_status`,
            )
              .then((res) => (Array.isArray(res) ? res : []))
              .catch(() => [])
          : Promise.resolve([]),
        deliveryIds.length > 0
          ? database(
              `/rest/v1/rider_assignment_requests?delivery_id=in.(${deliveryIds.join(',')})&status=eq.accepted&select=delivery_id,rider_id`,
            )
              .then((res) => (Array.isArray(res) ? res : []))
              .catch(() => [])
          : Promise.resolve([]),
      ]);

      const deliveryMap = new Map((deliveries as JsonRow[]).map((d) => [d.delivery_id, d]));
      const assignmentMap = new Map((assignments as JsonRow[]).map((a) => [a.delivery_id, a]));

      const riderIds = [
        ...new Set((assignments as JsonRow[]).map((a) => a.rider_id).filter(Boolean)),
      ];
      const riders = riderIds.length > 0
        ? await database(
            `/rest/v1/riders?rider_id=in.(${riderIds.join(',')})&select=rider_id,full_name,contact_number`,
          )
            .then((res) => (Array.isArray(res) ? res : []))
            .catch(() => [])
        : [];
      const riderMap = new Map((riders as JsonRow[]).map((r) => [r.rider_id, r]));

      deliveryChats = latestMessages.map((m) => {
        const d = deliveryMap.get(m.delivery_id) || {};
        const a = assignmentMap.get(m.delivery_id);
        const r = a?.rider_id ? riderMap.get(a.rider_id) : null;
        return {
          conversation_id: `delivery:${m.delivery_id}:support`,
          delivery_id: m.delivery_id,
          rider_id: a?.rider_id ?? null,
          rider_name: r?.full_name ?? 'Rider',
          rider_phone: r?.contact_number ?? null,
          last_message: m.body,
          last_activity: m.sent_at,
          last_sender_role: m.sender_role,
          order_id: d.order_id ?? null,
          delivery_status: d.delivery_status ?? 'pending',
        };
      });
    }
  } catch {
    // If rider delivery messages query fails, deliveryChats stays []
  }

  let totalMarketplace = 0;
  let flaggedMarketplace = 0;
  try {
    const convs = await rpc('admin_get_marketplace_conversations', {
      p_filter: 'all',
      p_search: null,
      p_limit: 500,
      p_offset: 0,
    });
    if (Array.isArray(convs)) {
      totalMarketplace = convs.length;
      flaggedMarketplace = (convs as JsonRow[]).filter((c) =>
        ['flagged', 'under_review', 'suspended'].includes(String(c?.moderation_status ?? '')),
      ).length;
    }
  } catch {
    // If marketplace RPC fails, counts stay 0
  }

  return {
    tickets: [],
    delivery_chats: deliveryChats,
    stats: {
      total: 0,
      open: 0,
      in_progress: 0,
      waiting_on_customer: 0,
      resolved: 0,
      urgent: 0,
      delivery_support_chats: deliveryChats.length,
      marketplace_chats: totalMarketplace,
      flagged_marketplace_chats: flaggedMarketplace,
    },
  };
}

export async function supportRequest(input: SupportRequest, database: RequestDatabase) {
  if (!/^\/api\/admin\/support(?:\/|$)/.test(input.path)) return null;

  if (
    !input.permissions.includes('support:manage') &&
    !input.permissions.includes('admin:manage')
  ) {
    throw fail('Customer support management permission is required.', 403);
  }

  const rpc = async (name: string, args = {}) => {
    try {
      return await database(`/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Support request failed.';
      if (/Could not find the function|does not exist|schema cache/.test(message)) {
        throw fail(
          'Support center is not installed on the database. Apply the support center migration.',
          503,
        );
      }
      if (/not found/i.test(message)) throw fail(message, 404);
      if (/Invalid|required|notes|body|message/i.test(message)) throw fail(message, 400);
      throw fail('Unable to reach support data. Please try again.', 502);
    }
  };

  // GET /api/admin/support
  if (input.method === 'GET' && input.path === '/api/admin/support') {
    try {
      const result = await rpc('admin_get_support_hub');
      return { status: 200, body: row(result) };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : '';
      if (/support center is not installed|support_tickets|does not exist|schema cache/i.test(message)) {
        const fallback = await fetchFallbackSupportHub(database, rpc);
        return { status: 200, body: fallback };
      }
      throw cause;
    }
  }

  // GET /api/admin/support/tickets/:id
  const ticketMatch = input.path.match(/^\/api\/admin\/support\/tickets\/([1-9]\d*)$/);
  if (input.method === 'GET' && ticketMatch) {
    const ticketId = ticketMatch[1];
    const result = await rpc('admin_get_support_ticket_detail', { p_ticket_id: Number(ticketId) });
    if (!result) throw fail('Support ticket not found.', 404);
    return { status: 200, body: row(result) };
  }

  // POST /api/admin/support/reply
  if (input.method === 'POST' && input.path === '/api/admin/support/reply') {
    const body = row(input.body);
    const ticketId = Number(body.ticketId ?? body.ticket_id);
    const textBody = typeof body.body === 'string' ? body.body.trim() : '';

    if (!ticketId || Number.isNaN(ticketId)) throw fail('Valid ticket ID is required.');
    if (!textBody) throw fail('Message content cannot be empty.');
    if (!input.actor) throw fail('An authenticated administrator is required.', 401);

    const result = await rpc('admin_send_support_message', {
      p_ticket_id: ticketId,
      p_body: textBody,
      p_actor: input.actor,
    });

    return { status: 200, body: row(result) };
  }

  // POST /api/admin/support/status
  if (input.method === 'POST' && input.path === '/api/admin/support/status') {
    const body = row(input.body);
    const ticketId = Number(body.ticketId ?? body.ticket_id);
    const status = typeof body.status === 'string' ? body.status.trim() : null;
    const priority = typeof body.priority === 'string' ? body.priority.trim() : null;
    const notes = typeof body.notes === 'string' ? body.notes.trim() : null;

    if (!ticketId || Number.isNaN(ticketId)) throw fail('Valid ticket ID is required.');

    const result = await rpc('admin_update_support_ticket', {
      p_ticket_id: ticketId,
      p_status: status,
      p_priority: priority,
      p_notes: notes,
      p_actor: input.actor,
    });

    return { status: 200, body: row(result) };
  }

  // POST /api/admin/support/create
  if (input.method === 'POST' && input.path === '/api/admin/support/create') {
    const body = row(input.body);
    const userId = Number(body.userId ?? body.user_id);
    const subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const category = typeof body.category === 'string' ? body.category.trim() : 'general';
    const priority = typeof body.priority === 'string' ? body.priority.trim() : 'medium';
    const initialMessage = typeof body.initialMessage === 'string' ? body.initialMessage.trim() : null;

    if (!userId || Number.isNaN(userId)) throw fail('Valid customer user ID is required.');
    if (!subject) throw fail('Subject is required.');

    const result = await rpc('admin_create_support_ticket', {
      p_user_id: userId,
      p_subject: subject,
      p_category: category,
      p_priority: priority,
      p_initial_message: initialMessage,
      p_actor: input.actor,
    });

    return { status: 201, body: row(result) };
  }

  // POST /api/admin/support/reply-delivery-chat
  if (input.method === 'POST' && input.path === '/api/admin/support/reply-delivery-chat') {
    const body = row(input.body);
    const conversationId = typeof body.conversationId === 'string' ? body.conversationId.trim() : '';
    const textBody = typeof body.body === 'string' ? body.body.trim() : '';

    if (!conversationId) throw fail('Conversation ID is required.');
    if (!textBody) throw fail('Message content cannot be empty.');

    const result = await rpc('send_rider_delivery_message', {
      p_conversation_id: conversationId,
      p_body: textBody,
      p_kind: 'text',
      p_attachment_reference: null,
      p_idempotency_key: `cmd-support-msg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    });

    return { status: 200, body: row(result) };
  }

  // GET /api/admin/support/marketplace-chats
  if (input.method === 'GET' && input.path === '/api/admin/support/marketplace-chats') {
    const filter = input.query?.get('filter') ?? 'all';
    const search = input.query?.get('search') ?? null;
    const limit = Number(input.query?.get('limit') ?? 100);
    const offset = Number(input.query?.get('offset') ?? 0);

    const result = await rpc('admin_get_marketplace_conversations', {
      p_filter: filter,
      p_search: search,
      p_limit: limit,
      p_offset: offset,
    });

    return { status: 200, body: { conversations: Array.isArray(result) ? result : [] } };
  }

  // GET /api/admin/support/marketplace-chats/:id
  const marketplaceMatch = input.path.match(/^\/api\/admin\/support\/marketplace-chats\/([1-9]\d*)$/);
  if (input.method === 'GET' && marketplaceMatch) {
    const conversationId = marketplaceMatch[1];
    const result = await rpc('admin_get_marketplace_conversation_detail', {
      p_conversation_id: Number(conversationId),
    });
    if (!result) throw fail('Marketplace conversation not found.', 404);
    return { status: 200, body: row(result) };
  }

  // POST /api/admin/support/marketplace-chats/:id/moderate
  const moderateMatch = input.path.match(/^\/api\/admin\/support\/marketplace-chats\/([1-9]\d*)\/moderate$/);
  if (input.method === 'POST' && moderateMatch) {
    const conversationId = Number(moderateMatch[1]);
    const body = row(input.body);
    const status = typeof body.status === 'string' ? body.status.trim() : '';
    const flagReason = typeof body.flag_reason === 'string' ? body.flag_reason.trim() : (typeof body.flagReason === 'string' ? body.flagReason.trim() : null);
    const notes = typeof body.notes === 'string' ? body.notes.trim() : (typeof body.moderation_notes === 'string' ? body.moderation_notes.trim() : null);

    if (!status) throw fail('Moderation status is required.');

    const result = await rpc('admin_moderate_marketplace_conversation', {
      p_conversation_id: conversationId,
      p_status: status,
      p_flag_reason: flagReason,
      p_notes: notes,
      p_actor: input.actor,
    });

    return { status: 200, body: row(result) };
  }

  // POST /api/admin/support/marketplace-chats/:id/intervene
  const interveneMatch = input.path.match(/^\/api\/admin\/support\/marketplace-chats\/([1-9]\d*)\/intervene$/);
  if (input.method === 'POST' && interveneMatch) {
    const conversationId = Number(interveneMatch[1]);
    const body = row(input.body);
    const textBody = typeof body.body === 'string' ? body.body.trim() : (typeof body.message === 'string' ? body.message.trim() : '');

    if (!textBody) throw fail('Intervention message content cannot be empty.');

    const result = await rpc('admin_send_marketplace_intervention', {
      p_conversation_id: conversationId,
      p_body: textBody,
      p_actor: input.actor,
    });

    return { status: 200, body: row(result) };
  }

  throw fail('Support endpoint not found.', 404);
}
