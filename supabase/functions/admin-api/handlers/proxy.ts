import { SUPABASE_URL } from "../config.ts";
import { deliveryRequest } from "../deliveries.ts";
import { orderRequest } from "../orders.ts";
import { paymentRequest } from "../payments.ts";
import { safetyRequest } from "../safety.ts";
import { requestSupabase } from "../repository.ts";
import type { Admin, HandlerResult } from "../types.ts";

export const handleProxyRoutes = async (
  request: Request, pathname: string, admin: Admin,
): Promise<HandlerResult | null> => {
  if (/^\/api\/admin\/payments(?:\/|$)/.test(pathname)) {
    const input = await createProxyInput(request, pathname, admin);
    return await paymentRequest(input, requestSupabase);
  }
  if (/^\/api\/admin\/deliveries(?:\/|$)/.test(pathname)) {
    const input = await createProxyInput(request, pathname, admin);
    return await deliveryRequest({
      ...input, storageOrigin: SUPABASE_URL, query: new URL(request.url).searchParams,
    }, requestSupabase);
  }
  if (/^\/api\/admin\/orders(?:\/|$)/.test(pathname)) {
    const input = await createProxyInput(request, pathname, admin);
    return await orderRequest(input, requestSupabase);
  }
  if (/^\/api\/admin\/safety(?:\/|$)/.test(pathname)) {
    const input = await createProxyInput(request, pathname, admin);
    return await safetyRequest({
      ...input, storageOrigin: SUPABASE_URL, query: new URL(request.url).searchParams,
    }, requestSupabase);
  }
  return null;
};

const createProxyInput = async (request: Request, pathname: string, admin: Admin) => ({
  path: pathname,
  method: request.method,
  permissions: admin.permissions,
  actor: admin.email,
  body: request.method === "POST" ? await request.json().catch(() => null) : undefined,
});
