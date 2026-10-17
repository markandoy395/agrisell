// Shared by the Node backend and Supabase Edge Function.
type JsonRow = Record<string, unknown>;
type RequestDatabase = (path: string, init?: RequestInit) => Promise<unknown>;
type PaymentRequest = {
  path: string;
  method: string;
  permissions: string[];
  actor: string;
  body?: unknown;
};

const fail = (message: string, status = 400) =>
  Object.assign(new Error(message), { status, code: "PAYMENT_REQUEST_FAILED" });
const row = (value: unknown): JsonRow =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRow)
    : {};
const positiveId = (value: unknown) =>
  typeof value === "string" && /^[1-9]\d*$/.test(value);
const text = (value: unknown, max: number) =>
  typeof value === "string" && value.trim() && value.trim().length <= max;

export async function paymentRequest(
  input: PaymentRequest,
  database: RequestDatabase,
) {
  if (!/^\/api\/admin\/payments(?:\/|$)/.test(input.path)) return null;
  const canView =
    input.permissions.includes("payments:view") ||
    input.permissions.includes("payments:manage") ||
    input.permissions.includes("admin:manage");
  const canManage =
    input.permissions.includes("payments:manage") ||
    input.permissions.includes("admin:manage");
  if (!canView) throw fail("Payment access permission is required.", 403);
  if (input.method === "POST" && !canManage)
    throw fail("Payment management permission is required.", 403);

  const rpc = async (name: string, args: JsonRow) => {
    try {
      return await database(`/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(args),
      });
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Payment request failed.";
      if (
        /Could not find the function|does not exist|schema cache/.test(message)
      )
        throw fail(
          "Payment operations are not installed on the database. Apply the admin financial operations migration.",
          503,
        );
      if (/changed|already used|40001|unique/i.test(message))
        throw fail(message, 409);
      if (
        /not found|invalid|required|cannot|only|exceed|eligible|transition|reference|amount/i.test(
          message,
        )
      )
        throw fail(message, 400);
      throw fail("Unable to reach payment data. Please try again.", 502);
    }
  };

  const detail = input.path.match(/^\/api\/admin\/payments\/([1-9]\d*)$/);
  if (input.method === "GET" && detail)
    return {
      status: 200,
      body: await rpc("admin_payment_detail", { p_payment_id: detail[1] }),
    };
  if (input.method === "GET" && input.path === "/api/admin/payments/report")
    return { status: 200, body: await rpc("admin_payment_report", {}) };
  if (
    input.method === "GET" &&
    input.path === "/api/admin/payments/payout-requests"
  ) {
    return { status: 200, body: await rpc("admin_get_payout_requests", {}) };
  }
  if (
    input.method === "POST" &&
    input.path === "/api/admin/payments/payout-requests"
  ) {
    const body = row(input.body);
    if (!input.actor)
      throw fail("An authenticated administrator is required.", 401);
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        String(body.request_id),
      )
    )
      throw fail("A valid payout request ID is required.");
    if (!["approve", "reject", "mark_paid"].includes(String(body.action)))
      throw fail("Invalid payout action.");
    if (body.action === "mark_paid" && !text(body.payout_reference, 200))
      throw fail("A completed transfer reference is required.");
    if (body.action === "reject" && !text(body.rejection_reason, 1000))
      throw fail("A rejection reason is required.");
    return {
      status: 200,
      body: await rpc("admin_update_payout_request", {
        p_input: body,
        p_actor: input.actor,
      }),
    };
  }
  if (input.method === "POST" && input.path === "/api/admin/payments") {
    const body = row(input.body);
    const action = String(body.action ?? "");
    if (
      ![
        "verify",
        "settlement",
        "payout",
        "refund",
        "dispute",
        "failed",
      ].includes(action)
    )
      throw fail("Unknown payment action.");
    if (
      !positiveId(String(body.payment_id ?? "")) ||
      typeof body.previous_version !== "string"
    )
      throw fail("Payment and previous version are required.");
    if (
      !text(body.command_id, 100) ||
      !/^[\w-]{8,100}$/.test(String(body.command_id))
    )
      throw fail("A valid command ID is required.");
    if (!text(body.reason, 1000))
      throw fail("A reason of at most 1,000 characters is required.");
    if (
      action === "verify" &&
      !["verified", "rejected"].includes(String(body.decision))
    )
      throw fail("Choose a verification decision.");
    if (
      action === "settlement" &&
      !["approved", "settled"].includes(String(body.decision))
    )
      throw fail("Choose a settlement decision.");
    if (
      action === "payout" &&
      !["approved", "paid", "failed"].includes(String(body.decision))
    )
      throw fail("Choose a payout decision.");
    if (
      action === "refund" &&
      !["approved", "completed", "failed"].includes(String(body.decision))
    )
      throw fail("Choose a refund decision.");
    if (
      action === "dispute" &&
      !["open", "resolved"].includes(String(body.decision))
    )
      throw fail("Choose a dispute action.");
    if (
      action === "failed" &&
      !["retry_requested", "resolved"].includes(String(body.decision))
    )
      throw fail("Choose a failed-payment action.");
    if (
      ["verify", "settlement", "payout", "refund"].includes(action) &&
      ["verified", "settled", "paid", "completed"].includes(
        String(body.decision),
      ) &&
      !text(body.reference, 200)
    )
      throw fail("A transaction reference is required.");
    if (
      ["payout", "refund"].includes(action) &&
      (typeof body.amount !== "number" ||
        !Number.isFinite(body.amount) ||
        body.amount <= 0)
    )
      throw fail("Enter a valid positive amount.");
    if (!input.actor)
      throw fail("An authenticated administrator is required.", 401);
    return {
      status: 200,
      body: await rpc("admin_save_payment_action", {
        p_input: body,
        p_actor: input.actor,
      }),
    };
  }
  throw fail("Payment route not found.", 404);
}
