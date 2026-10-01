import { ALLOWED_ORIGINS } from "./config.ts";

export const securityHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; sandbox",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-site",
  Expires: "0",
  "Permissions-Policy": "camera=(), geolocation=(), microphone=()",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} as const;

export const corsHeaders = (request: Request) => {
  const requestOrigin = request.headers.get("origin") ?? "";
  const permittedOrigin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "DELETE, GET, PATCH, POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
    ...securityHeaders,
  };
  if (permittedOrigin) headers["Access-Control-Allow-Origin"] = permittedOrigin;
  return headers;
};

export const jsonResponse = (
  request: Request,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  new Response(JSON.stringify(body), {
    headers: { ...headers, ...corsHeaders(request) },
    status,
  });
