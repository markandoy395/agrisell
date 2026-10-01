// Shared by the Node backend and Supabase Edge Function.
type JsonRow = Record<string, unknown>;
type RequestDatabase = (path: string, init?: RequestInit) => Promise<unknown>;
type SafetyRequest = {
  path: string;
  method: string;
  permissions: string[];
  actor: string;
  storageOrigin?: string;
  body?: unknown;
  query?: URLSearchParams;
};

const error = (message: string, status = 400) =>
  Object.assign(new Error(message), { status, code: 'SAFETY_REQUEST_FAILED' });

const row = (value: unknown): JsonRow =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRow)
    : {};

export async function safetyRequest(input: SafetyRequest, database: RequestDatabase) {
  if (!/^\/api\/admin\/safety(?:\/|$)/.test(input.path)) return null;

  if (
    !input.permissions.includes('logistics:manage') &&
    !input.permissions.includes('admin:manage')
  ) {
    throw error('Logistics management permission is required.', 403);
  }

  const rpc = async (name: string, args = {}) => {
    try {
      return await database(`/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Safety request failed.';
      if (/Could not find the function|does not exist|schema cache/.test(message)) {
        throw error(
          'Safety incident management is not installed on the database. Apply the safety monitoring migration.',
          503,
        );
      }
      if (/not found/i.test(message)) throw error(message, 404);
      if (/Invalid|required|notes/i.test(message)) throw error(message, 400);
      throw error('Unable to reach safety incident data. Please try again.', 502);
    }
  };

  // GET /api/admin/safety
  if (input.method === 'GET' && input.path === '/api/admin/safety') {
    const statusParam = input.query?.get('status')?.trim() || null;
    const searchParam = input.query?.get('search')?.trim() || null;
    const offset = Number(input.query?.get('offset') ?? 0);
    const limit = Number(input.query?.get('limit') ?? 100);

    if (!Number.isInteger(offset) || offset < 0) throw error('Invalid page offset.');
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw error('Invalid page limit.');

    let result;
    try {
      result = await rpc('admin_safety_incidents', {
        p_status: statusParam,
        p_search: searchParam,
        p_offset: offset,
        p_limit: limit,
      });
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : String(cause);
      const status = (cause as { status?: number })?.status;
      if (status === 502 || status === 503 || /permission|not installed|does not exist|schema cache|Unable to reach/i.test(msg)) {
        result = await fetchSafetyIncidentsDirect(database, statusParam, searchParam, offset, limit);
      } else {
        throw cause;
      }
    }

    return { status: 200, body: row(result) };
  }

  // POST /api/admin/safety/resolve
  if (input.method === 'POST' && input.path === '/api/admin/safety/resolve') {
    const body = row(input.body);
    const reportId = typeof body.reportId === 'string' ? body.reportId.trim() : '';
    const status = typeof body.status === 'string' ? body.status.trim() : '';
    const notes = typeof body.notes === 'string' ? body.notes.trim() : '';

    if (!reportId) throw error('Report ID is required.');
    const validStatuses = [
      'submitted',
      'underReview',
      'waitingForInformation',
      'resolved',
      'rejected',
      'escalated',
    ];
    if (!validStatuses.includes(status)) {
      throw error(`Choose a valid resolution status: ${validStatuses.join(', ')}.`);
    }
    if (!notes) throw error('Resolution notes are required.');
    if (notes.length > 2000) throw error('Resolution notes cannot exceed 2,000 characters.');

    let result;
    try {
      result = await rpc('admin_resolve_safety_incident', {
        p_report_id: reportId,
        p_status: status,
        p_notes: notes,
        p_actor: input.actor,
      });
    } catch (cause) {
      const msg = cause instanceof Error ? cause.message : String(cause);
      const status = (cause as { status?: number })?.status;
      if (status === 502 || status === 503 || /permission|not installed|does not exist|schema cache|Unable to reach/i.test(msg)) {
        const now = new Date().toISOString();
        await database(`/rest/v1/rider_incidents?report_id=eq.${encodeURIComponent(reportId)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
          body: JSON.stringify({
            status,
            resolution_notes: notes,
            resolved_by: input.actor,
            resolved_at: now,
            updated_at: now,
          }),
        });
        result = {
          report_id: reportId,
          status,
          resolution_notes: notes,
          resolved_by: input.actor,
          resolved_at: now,
        };
      } else {
        throw cause;
      }
    }

    return { status: 200, body: row(result) };
  }

  throw error('Safety route not found.', 404);
}

async function fetchSafetyIncidentsDirect(
  database: RequestDatabase,
  statusParam: string | null,
  searchParam: string | null,
  offset: number,
  limit: number,
) {
  const raw = ((await database(
    '/rest/v1/rider_incidents?select=*,riders(*),deliveries(*)&order=reported_at.desc',
  ).catch(() => [])) ?? []) as JsonRow[];
  const list = Array.isArray(raw) ? raw : [];

  const total_count = list.length;
  const open_emergencies = list.filter((i) =>
    (i.category === 'emergencySos' || i.report_type === 'safety_action') &&
    ['submitted', 'underReview', 'escalated'].includes(String(i.status)),
  ).length;
  const active_accidents = list.filter((i) =>
    ['accident', 'medicalEmergency', 'theft', 'harassment'].includes(String(i.category)) &&
    ['submitted', 'underReview', 'escalated'].includes(String(i.status)),
  ).length;
  const under_review = list.filter((i) =>
    ['underReview', 'waitingForInformation', 'escalated'].includes(String(i.status)),
  ).length;
  const resolved = list.filter((i) =>
    ['resolved', 'rejected'].includes(String(i.status)),
  ).length;

  let filtered = list;
  if (statusParam) {
    const s = statusParam.toLowerCase();
    if (s === 'emergency') {
      filtered = filtered.filter((i) =>
        (i.category === 'emergencySos' || i.report_type === 'safety_action') &&
        ['submitted', 'underReview', 'escalated'].includes(String(i.status)),
      );
    } else if (s === 'accidents') {
      filtered = filtered.filter((i) =>
        ['accident', 'medicalEmergency', 'theft', 'harassment'].includes(String(i.category)),
      );
    } else if (s === 'vehicle') {
      filtered = filtered.filter((i) =>
        ['vehicleBreakdown', 'roadClosure', 'severeWeather'].includes(String(i.category)),
      );
    } else if (s === 'open') {
      filtered = filtered.filter((i) =>
        ['submitted', 'underReview', 'waitingForInformation', 'escalated'].includes(String(i.status)),
      );
    } else if (s === 'resolved') {
      filtered = filtered.filter((i) =>
        ['resolved', 'rejected'].includes(String(i.status)),
      );
    } else {
      filtered = filtered.filter((i) => String(i.status).toLowerCase() === s);
    }
  }

  if (searchParam) {
    const term = searchParam.toLowerCase();
    filtered = filtered.filter((i) => {
      const r = row(i.riders);
      return (
        String(i.report_id ?? '').toLowerCase().includes(term) ||
        String(i.category ?? '').toLowerCase().includes(term) ||
        String(i.description ?? '').toLowerCase().includes(term) ||
        String(i.reporter_role ?? '').toLowerCase().includes(term) ||
        String(i.reporter_name ?? '').toLowerCase().includes(term) ||
        String(i.reporter_contact ?? '').toLowerCase().includes(term) ||
        String(i.reporter_email ?? '').toLowerCase().includes(term) ||
        String(r.full_name ?? '').toLowerCase().includes(term) ||
        String(r.first_name ?? '').toLowerCase().includes(term) ||
        String(r.last_name ?? '').toLowerCase().includes(term)
      );
    });
  }

  const paged = filtered.slice(offset, offset + limit).map((i) => {
    const r = row(i.riders);
    const d = row(i.deliveries);
    return {
      report_id: i.report_id,
      rider_id: i.rider_id,
      delivery_id: i.delivery_id,
      order_id: i.order_id ?? d.order_id ?? null,
      report_type: i.report_type,
      category: i.category,
      stage: i.stage,
      description: i.description,
      latitude: i.latitude,
      longitude: i.longitude,
      accuracy_meters: i.accuracy_meters,
      attachments: i.attachments,
      requested_actions: i.requested_actions,
      status: i.status,
      reported_at: i.reported_at,
      created_at: i.created_at,
      updated_at: i.updated_at,
      resolution_notes: i.resolution_notes,
      resolved_by: i.resolved_by,
      resolved_at: i.resolved_at,
      reporter_role: i.reporter_role,
      reporter_name: i.reporter_name,
      reporter_contact: i.reporter_contact,
      reporter_email: i.reporter_email,
      reporter: {
        role: i.reporter_role,
        name: i.reporter_name ?? r.full_name ?? 'User',
        contact_number: i.reporter_contact ?? r.contact_number,
        email: i.reporter_email ?? r.email,
      },
      rider: r.rider_id ? {
        full_name: r.full_name,
        first_name: r.first_name,
        last_name: r.last_name,
        contact_number: r.contact_number,
        email: r.email,
        vehicle_type: r.vehicle_type,
        plate_number: r.vehicle_plate_number,
      } : null,
      delivery: d.delivery_id ? {
        delivery_id: d.delivery_id,
        order_id: d.order_id,
        delivery_status: d.delivery_status,
        pickup_location: d.pickup_location,
        dropoff_location: d.dropoff_location,
      } : null,
    };
  });

  return {
    incidents: paged,
    summary: {
      total_incidents: total_count,
      open_emergencies,
      active_accidents,
      under_review,
      resolved,
    },
  };
}
