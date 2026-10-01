import { SERVICE_ROLE_KEY, SUPABASE_URL } from "./config.ts";
import { corsHeaders, jsonResponse } from "./http.ts";
import { routeRequest } from "./router.ts";
import { text } from "./value.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(request), status: 204 });
  }
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return jsonResponse(request, 503, {
      code: "DATABASE_NOT_CONFIGURED",
      message: "The admin database is not configured.",
    });
  }
  try {
    const result = await routeRequest(request);
    return jsonResponse(request, result.status, result.body, result.headers);
  } catch (error) {
    console.error("Agrisell admin API error", error);
    const status = typeof (error as { status?: unknown })?.status === "number"
      ? (error as { status: number }).status : 502;
    const code = text((error as { code?: unknown })?.code, "DATABASE_UNAVAILABLE");
    const message = error instanceof Error && code !== "DATABASE_UNAVAILABLE"
      ? error.message : "The admin database could not be reached. Please try again.";
    return jsonResponse(request, status, { code, message });
  }
});
