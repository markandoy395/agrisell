// Shared by the Node backend and Supabase Edge Function.
type JsonRow = Record<string, unknown>;
type RequestDatabase = (path: string, init?: RequestInit) => Promise<unknown>;
type DeliveryRequest = { path: string; method: string; permissions: string[]; actor: string; storageOrigin?: string; body?: unknown; query?: URLSearchParams };
const error = (message: string, status = 400) => Object.assign(new Error(message), { status, code: 'DELIVERY_REQUEST_FAILED' });
const row = (value: unknown): JsonRow => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRow : {};
const positiveId = (value: unknown) => typeof value === 'string' && /^[1-9]\d*$/.test(value);

export async function deliveryRequest(input: DeliveryRequest, database: RequestDatabase) {
  if (!/^\/api\/admin\/deliveries(?:\/|$)/.test(input.path)) return null;
  if (!input.permissions.includes('logistics:manage') && !input.permissions.includes('admin:manage')) throw error('Logistics permission is required.', 403);
  const rpc = async (name: string, args = {}) => {
    try { return await database(`/rest/v1/rpc/${name}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args) }); }
    catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Delivery request failed.';
      if (/Could not find the function|does not exist|schema cache/.test(message)) throw error('Delivery management is not installed on the database. Apply the admin delivery migration.', 503);
      if (/changed|already used|already has a delivery|40001/.test(message)) throw error(message, 409);
      if (/permission|Logistics management permission is required/i.test(message)) throw error(message, 502);
      if (/not found|Invalid|invalid|required|Cannot|cannot|Choose|offline|conflict|limit|Only|Pickup|pickup|closed|Schedule|missing|expired|ready|preparing|Confirm/.test(message)) throw error(message, 400);
      throw error('Unable to reach delivery data. Please try again.', 502);
    }
  };
  if (input.method === 'GET' && input.path === '/api/admin/deliveries/options') return { status: 200, body: await rpc('admin_delivery_options') };
  if (input.method === 'GET' && input.path === '/api/admin/deliveries/farmer-requests') {
    const offset = Number(input.query?.get('offset') ?? 0);
    if (!Number.isInteger(offset) || offset < 0) throw error('Invalid page offset.');
    const limit = Number(input.query?.get('limit') ?? 200);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw error('Invalid page limit.');
    const status = input.query?.get('status') || null;
    const deliveryIdRaw = input.query?.get('delivery_id');
    const deliveryId = deliveryIdRaw && positiveId(deliveryIdRaw) ? Number(deliveryIdRaw) : null;
    if (deliveryIdRaw && !positiveId(deliveryIdRaw)) throw error('Invalid delivery ID.');

    let body;
    try {
      body = await rpc('admin_farmer_rider_requests', {
        p_delivery_id: deliveryId,
        p_status: status,
        p_offset: offset,
        p_limit: limit,
      });
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : String(cause);
      const statusNum = (cause as { status?: number })?.status;
      if (statusNum === 502 || statusNum === 503 || /permission|Logistics management permission is required|not installed|does not exist|schema cache|Unable to reach/i.test(msg)) {
        body = await fetchFarmerRequestsDirect(database, deliveryId, status, offset, limit);
      } else {
        throw cause;
      }
    }

    return {
      status: 200,
      body,
    };
  }
  if (input.method === 'GET' && ['/api/admin/deliveries','/api/admin/deliveries/tracking','/api/admin/deliveries/riders'].includes(input.path)) {
    const offset = Number(input.query?.get('offset') ?? 0);
    if (!Number.isInteger(offset) || offset < 0) throw error('Invalid page offset.');
    if (input.path.endsWith('/riders')) return { status: 200, body: await rpc('admin_rider_tracking_rows', { p_offset: offset, p_limit: 200 }) };
    return { status: 200, body: await rpc('admin_delivery_rows', { p_active: input.path.endsWith('/tracking'), p_offset: offset, p_limit: 200 }) };
  }
  const detail = input.path.match(/^\/api\/admin\/deliveries\/([1-9]\d*)$/);
  if (input.method === 'GET' && detail) {
    const data = row(await rpc('admin_delivery_detail', { p_delivery_id: detail[1] }));
    // Never return confirmation hashes or turn private evidence into public files.
    data.proofs = await Promise.all((Array.isArray(data.proofs) ? data.proofs : []).map(async (value) => {
      const proof = row(value);
      const path = typeof proof.file_path === 'string' ? proof.file_path : '';
      const { file_path: _path, ...safe } = proof;
      void _path;
      if (!path || path.includes('..') || path.startsWith('/') || path.includes('://')) return safe;
      try {
        const signed = row(await database(`/storage/v1/object/sign/delivery-proofs/${path.split('/').map(encodeURIComponent).join('/')}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expiresIn: 300 }),
        }));
        const signedPath = typeof signed.signedURL === 'string' ? signed.signedURL : '';
        return { ...safe, signed_path: signedPath.startsWith('/object/sign/delivery-proofs/') && input.storageOrigin
          ? `${input.storageOrigin.replace(/\/$/,'')}/storage/v1${signedPath}` : signedPath };
      } catch { return { ...safe, image_error: 'Evidence image is temporarily unavailable.' }; }
    }));
    return { status: 200, body: data };
  }
  if (input.method === 'POST' && input.path === '/api/admin/deliveries') {
    const body = row(input.body);
    if (!['create','assign','status','complete','delete','update','reopen'].includes(String(body.action))) throw error('Unknown delivery action.');
    if (typeof body.command_id !== 'string' || !/^[\w-]{8,100}$/.test(body.command_id)) throw error('A valid command ID is required.');
    if (body.action === 'create') {
      if (!positiveId(String(body.order_id ?? ''))) throw error('Choose an order.');
      if (typeof body.scheduled_at !== 'string' || !Number.isFinite(Date.parse(body.scheduled_at))) throw error('Enter a valid delivery schedule.');
    } else {
      if (!positiveId(String(body.delivery_id ?? '')) || typeof body.previous_status !== 'string') throw error('Delivery and previous status are required.');
      if (body.action === 'assign' && (typeof body.rider_id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(body.rider_id))) throw error('Choose a rider.');
      if (body.action === 'status' && typeof body.status !== 'string') throw error('Choose a delivery status.');
      if (body.action === 'complete' && (typeof body.reason !== 'string' || !body.reason.trim())) throw error('A completion reason is required.');
      if (body.action === 'update') {
        if (typeof body.pickup_location !== 'string' || !body.pickup_location.trim() || body.pickup_location.length > 500) throw error('Enter a valid pickup location.');
        if (typeof body.dropoff_location !== 'string' || !body.dropoff_location.trim() || body.dropoff_location.length > 500) throw error('Enter a valid destination.');
        if (typeof body.scheduled_at !== 'string' || !Number.isFinite(Date.parse(body.scheduled_at))) throw error('Enter a valid delivery schedule.');
      }
      if (body.action === 'reopen' && (typeof body.reason !== 'string' || !body.reason.trim())) throw error('A retry reason is required.');
    }
    if (body.reason !== undefined && (typeof body.reason !== 'string' || body.reason.length > 1000)) throw error('Reason must be at most 1,000 characters.');
    if (!input.actor) throw error('An authenticated administrator is required.', 401);
    const rpcName = body.action === 'complete' ? 'admin_complete_delivery'
      : body.action === 'delete' ? 'admin_delete_delivery'
      : body.action === 'update' ? 'admin_update_delivery'
      : body.action === 'reopen' ? 'admin_reopen_delivery'
      : 'admin_save_delivery';
    return { status: 200, body: await rpc(rpcName, { p_input: body, p_actor: input.actor }) };
  }
  throw error('Delivery route not found.', 404);
}

async function fetchFarmerRequestsDirect(
  database: RequestDatabase,
  deliveryId: number | null,
  status: string | null,
  offset: number,
  limit: number,
) {
  let path = '/rest/v1/rider_assignment_requests?select=*,deliveries(*),riders(*),farmers(*)&order=requested_at.desc';
  if (deliveryId) path += `&delivery_id=eq.${deliveryId}`;

  const raw = ((await database(path).catch(() => [])) ?? []) as JsonRow[];
  const list = Array.isArray(raw) ? raw : [];

  const counts = {
    total: list.length,
    pending_count: list.filter((r) => r.status === 'pending').length,
    accepted_count: list.filter((r) => r.status === 'accepted').length,
    declined_count: list.filter((r) => r.status === 'declined').length,
    expired_count: list.filter((r) => r.status === 'expired').length,
    cancelled_count: list.filter((r) => r.status === 'cancelled').length,
    failed_count: list.filter((r) => r.status === 'failed').length,
  };

  let filtered = list;
  if (status && status !== 'all') {
    filtered = filtered.filter((r) => String(r.status).toLowerCase() === status.toLowerCase());
  }

  const rows = filtered.slice(offset, offset + limit).map((req) => {
    const d = row(req.deliveries);
    const r = row(req.riders);
    const f = row(req.farmers);
    const farmerName = [f.first_name, f.last_name].filter(Boolean).join(' ') || `Farmer #${req.farmer_user_id}`;
    const riderName = r.full_name || [r.first_name, r.last_name].filter(Boolean).join(' ') || 'Rider';

    return {
      request_id: String(req.request_id),
      delivery_id: req.delivery_id,
      seller_order_id: req.seller_order_id,
      order_id: d.order_id ?? null,
      farmer_user_id: req.farmer_user_id,
      farmer_name: farmerName,
      farmer_phone: f.phone_number ?? null,
      farmer_image_url: f.profile_image_url ?? null,
      farm_name: 'Farm',
      farm_location: d.pickup_location ?? 'Location unavailable',
      rider_id: String(req.rider_id),
      rider_name: riderName,
      rider_phone: r.contact_number ?? null,
      rider_vehicle_type: r.vehicle_type ?? null,
      rider_availability_status: r.availability_status ?? null,
      rider_photo_url: r.profile_photo_url ?? null,
      status: req.status,
      requested_schedule: req.requested_schedule,
      proposed_delivery_fee: req.proposed_delivery_fee,
      requested_at: req.requested_at,
      expires_at: req.expires_at,
      responded_at: req.responded_at,
      failure_reason: req.failure_reason,
      delivery_status: d.delivery_status ?? null,
      pickup_location: d.pickup_location ?? null,
      dropoff_location: d.dropoff_location ?? null,
      customer_name: d.buyer_name_snapshot ?? null,
    };
  });

  return {
    ...counts,
    rows,
  };
}
