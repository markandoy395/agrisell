// Shared by the Node backend and Supabase Edge Function.
type JsonRow = Record<string, unknown>;
type RequestDatabase = (path: string, init?: RequestInit) => Promise<unknown>;
type OrderRequest = { path: string; method: string; permissions: string[]; actor: string; body?: unknown };

const fail = (message: string, status = 400) => Object.assign(new Error(message), { status, code: 'ORDER_REQUEST_FAILED' });
const row = (value: unknown): JsonRow => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRow : {};
const positiveId = (value: unknown) => typeof value === 'string' && /^[1-9]\d*$/.test(value);

export async function orderRequest(input: OrderRequest, database: RequestDatabase) {
  if (!/^\/api\/admin\/orders(?:\/|$)/.test(input.path)) return null;
  if (!input.permissions.includes('orders:manage') && !input.permissions.includes('admin:manage')) {
    throw fail('Order management permission is required.', 403);
  }
  const rpc = async (name: string, args: JsonRow) => {
    try {
      return await database(`/rest/v1/rpc/${name}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(args),
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Order request failed.';
      if (/Could not find the function|does not exist|schema cache/.test(message)) throw fail('Order management is not installed on the database. Apply the admin order management migration.', 503);
      if (/changed|already used|40001/.test(message)) throw fail(message, 409);
      if (/not found|invalid|required|cannot|only|available stock|transition|review/i.test(message)) throw fail(message, 400);
      throw fail('Unable to reach order data. Please try again.', 502);
    }
  };
  const detail = input.path.match(/^\/api\/admin\/orders\/([1-9]\d*)$/);
  if (input.method === 'GET' && detail) {
    const body = await rpc('admin_order_detail', { p_order_id: detail[1] });
    if (!body) throw fail('Order not found.', 404);
    return { status: 200, body };
  }
  if (input.method === 'POST' && input.path === '/api/admin/orders') {
    const body = row(input.body);
    const action = String(body.action ?? '');
    if (action === 'create_manual_order' || action === 'create') {
      if (!input.actor) throw fail('An authenticated administrator is required.', 401);
      if (typeof body.command_id !== 'string' || !/^[\w-]{8,100}$/.test(body.command_id)) {
        throw fail('A valid command ID is required.');
      }
      if (!Array.isArray(body.items) || body.items.length === 0) {
        throw fail('At least one order item is required.');
      }
      const buyerId = body.buyer_user_id ? String(body.buyer_user_id) : '';
      const customerName = typeof body.customer_name === 'string' ? body.customer_name.trim() : '';
      if (!buyerId && !customerName) {
        throw fail('A customer name or existing buyer is required.');
      }
      const contactNumber = typeof body.contact_number === 'string' ? body.contact_number.trim() : '';
      const deliveryAddress = typeof body.delivery_address === 'string' ? body.delivery_address.trim() : '';
      if (!buyerId && (!contactNumber || !deliveryAddress)) {
        throw fail('Contact number and delivery address are required.');
      }
      return { status: 201, body: await rpc('admin_create_manual_order', { p_input: body, p_actor: input.actor }) };
    }
    if (!['status', 'review_cancellation', 'refund', 'resolve_exception'].includes(action)) throw fail('Unknown order action.');
    if (!positiveId(String(body.order_id ?? '')) || typeof body.previous_status !== 'string') throw fail('Order and previous status are required.');
    if (typeof body.command_id !== 'string' || !/^[\w-]{8,100}$/.test(body.command_id)) throw fail('A valid command ID is required.');
    if (typeof body.reason !== 'string' || !body.reason.trim() || body.reason.length > 1000) throw fail('A reason of at most 1,000 characters is required.');
    if (action === 'status' && typeof body.status !== 'string') throw fail('Choose an order status.');
    if (action === 'review_cancellation' && !['approved', 'rejected'].includes(String(body.decision))) throw fail('Choose a cancellation review decision.');
    if (action === 'refund' && (typeof body.reference !== 'string' || !body.reference.trim() || body.reference.length > 200)) throw fail('A valid refund reference is required.');
    if (!input.actor) throw fail('An authenticated administrator is required.', 401);
    return { status: 200, body: await rpc('admin_save_order', { p_input: body, p_actor: input.actor }) };
  }
  throw fail('Order route not found.', 404);
}
