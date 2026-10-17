const { config } = require('../config/environment');
const { requestSupabaseAuth } = require('../services/supabaseService');
const { readJsonBody, sendJson } = require('../utils/http');
const { requirePermission, requireAnyPermission } = require('./adminRoutePermission');

const getProxyInput = async (request, pathname) => ({
  actor: request.admin.email,
  body: request.method === 'POST' ? await readJsonBody(request) : undefined,
  method: request.method,
  path: pathname,
  permissions: request.admin.permissions,
});

const sendProxyResult = (response, result) =>
  sendJson(response, result.status, result.body);

const sendProxyError = (response, error, code) =>
  sendJson(response, error.status ?? error.statusCode ?? 502, {
    code: error.code ?? code,
    message: error.message,
  });

const routePaymentRequest = async (request, response, pathname) => {
  if (!/^\/api\/admin\/payments(?:\/|$)/.test(pathname)) return false;
  if (!requireAnyPermission(request, response, ['payments:view', 'payments:manage'])) return true;
  try {
    const { paymentRequest } = await import('../../../supabase/functions/admin-api/payments.ts');
    sendProxyResult(
      response,
      await paymentRequest(await getProxyInput(request, pathname), requestSupabaseAuth),
    );
  } catch (error) {
    sendProxyError(response, error, 'PAYMENT_REQUEST_FAILED');
  }
  return true;
};

const routeOrderRequest = async (request, response, pathname) => {
  if (!/^\/api\/admin\/orders(?:\/|$)/.test(pathname)) return false;
  if (!requirePermission(request, response, 'orders:manage')) return true;
  try {
    const { orderRequest } = await import('../../../supabase/functions/admin-api/orders.ts');
    sendProxyResult(
      response,
      await orderRequest(await getProxyInput(request, pathname), requestSupabaseAuth),
    );
  } catch (error) {
    sendProxyError(response, error, 'ORDER_REQUEST_FAILED');
  }
  return true;
};

const routeDeliveryRequest = async (request, response, pathname) => {
  if (!/^\/api\/admin\/deliveries(?:\/|$)/.test(pathname)) return false;
  if (!requirePermission(request, response, 'logistics:manage')) return true;
  try {
    const { deliveryRequest } = await import('../../../supabase/functions/admin-api/deliveries.ts');
    const input = await getProxyInput(request, pathname);
    sendProxyResult(response, await deliveryRequest({
      ...input,
      query: new URL(request.url, 'http://localhost').searchParams,
      storageOrigin: config.supabaseUrl,
    }, requestSupabaseAuth));
  } catch (error) {
    sendProxyError(response, error, 'DELIVERY_REQUEST_FAILED');
  }
  return true;
};

const routeSafetyRequest = async (request, response, pathname) => {
  if (!/^\/api\/admin\/safety(?:\/|$)/.test(pathname)) return false;
  if (!requirePermission(request, response, 'logistics:manage')) return true;
  try {
    const { safetyRequest } = await import('../../../supabase/functions/admin-api/safety.ts');
    const input = await getProxyInput(request, pathname);
    sendProxyResult(response, await safetyRequest({
      ...input,
      query: new URL(request.url, 'http://localhost').searchParams,
      storageOrigin: config.supabaseUrl,
    }, requestSupabaseAuth));
  } catch (error) {
    sendProxyError(response, error, 'SAFETY_REQUEST_FAILED');
  }
  return true;
};

const routeSupportRequest = async (request, response, pathname) => {
  if (!/^\/api\/admin\/support(?:\/|$)/.test(pathname)) return false;
  if (!requirePermission(request, response, 'support:manage')) return true;
  try {
    const { supportRequest } = await import('../../../supabase/functions/admin-api/support.ts');
    const input = await getProxyInput(request, pathname);
    sendProxyResult(response, await supportRequest({
      ...input,
      query: new URL(request.url ?? '/', 'http://localhost').searchParams,
    }, requestSupabaseAuth));
  } catch (error) {
    sendProxyError(response, error, 'SUPPORT_REQUEST_FAILED');
  }
  return true;
};

const routeAdminApiProxy = async (request, response, pathname) =>
  await routePaymentRequest(request, response, pathname) ||
  await routeOrderRequest(request, response, pathname) ||
  await routeDeliveryRequest(request, response, pathname) ||
  await routeSafetyRequest(request, response, pathname) ||
  await routeSupportRequest(request, response, pathname);

module.exports = { routeAdminApiProxy };

