export type LoginCredentials = {
  email: string;
  password: string;
};

export type AuthenticatedAdmin = {
  avatarUrl?: string;
  email: string;
  name: string;
  role: "admin";
  permissions: string[];
};

export type AdminSession =
  | {
      admin: AuthenticatedAdmin;
      authenticated: true;
    }
  | {
      authenticated: false;
    };

export class ApiRequestError extends Error {
  code?: string;
  status: number;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
  }
}

const DEFAULT_API_BASE_URL = "http://localhost:3001";
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? "").replace(/\/+$/, "");
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "";
const EDGE_AUTH_STORAGE_KEY = "agrisell-admin-edge-session";

type EdgeAuthSession = {
  accessToken: string;
};

const usesSupabaseEdgeAuth = Boolean(
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY,
);

const getEdgeAuthSession = (): EdgeAuthSession | null => {
  if (!usesSupabaseEdgeAuth) return null;

  try {
    const value = sessionStorage.getItem(EDGE_AUTH_STORAGE_KEY);
    const parsed = value ? (JSON.parse(value) as unknown) : null;

    return isRecord(parsed) && typeof parsed.accessToken === "string"
      ? { accessToken: parsed.accessToken }
      : null;
  } catch {
    return null;
  }
};

const saveEdgeAuthSession = (accessToken: string) => {
  sessionStorage.setItem(EDGE_AUTH_STORAGE_KEY, JSON.stringify({ accessToken }));
};

const clearEdgeAuthSession = () => sessionStorage.removeItem(EDGE_AUTH_STORAGE_KEY);

const getApiBaseUrl = () =>
  (import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(
    /\/+$/,
    "",
  );

const getApiUrl = (path: string) => `${getApiBaseUrl()}${path}`;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const parseJsonResponse = async (response: Response): Promise<unknown> => {
  const text = await response.text();

  if (!text) return null;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
};

const getResponseMessage = (body: unknown, fallback: string) => {
  if (!isRecord(body) || typeof body.message !== "string") {
    return fallback;
  }

  return body.message;
};

const getResponseCode = (body: unknown) => {
  if (!isRecord(body) || typeof body.code !== "string") {
    return undefined;
  }

  return body.code;
};

const requestJson = async (
  path: string,
  options: RequestInit = {},
): Promise<unknown> => {
  const headers = new Headers(options.headers);
  const edgeSession = getEdgeAuthSession();

  if (options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (edgeSession && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${edgeSession.accessToken}`);
  }

  const response = await fetch(getApiUrl(path), {
    ...options,
    // Edge Functions receive the Supabase access token in Authorization.
    // Cookies are only needed by the local Node backend during development.
    credentials: usesSupabaseEdgeAuth ? "omit" : "include",
    headers,
  });
  const body = await parseJsonResponse(response);

  if (!response.ok) {
    throw new ApiRequestError(
      getResponseMessage(body, "The server could not complete the request."),
      response.status,
      getResponseCode(body),
    );
  }

  return body;
};

export const requestAdminApi = requestJson;

const parseAdminSession = (body: unknown): AdminSession => {
  if (!isRecord(body) || typeof body.authenticated !== "boolean") {
    throw new ApiRequestError("The server returned an invalid session.", 500);
  }

  if (!body.authenticated) {
    return { authenticated: false };
  }

  const admin = body.admin;

  if (
    !isRecord(admin) ||
    typeof admin.email !== "string" ||
    admin.role !== "admin" ||
    !Array.isArray(admin.permissions) ||
    !admin.permissions.every((permission) => typeof permission === "string")
  ) {
    throw new ApiRequestError("The server returned an invalid admin.", 500);
  }

  return {
    admin: {
      avatarUrl: typeof admin.avatarUrl === "string" && admin.avatarUrl
        ? admin.avatarUrl
        : undefined,
      email: admin.email,
      name: typeof admin.name === "string" && admin.name.trim()
        ? admin.name
        : admin.email.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()),
      permissions: admin.permissions,
      role: admin.role,
    },
    authenticated: true,
  };
};

export const getAdminSession = async () =>
  parseAdminSession(await requestJson("/api/auth/session"));

export const loginAdmin = async (credentials: LoginCredentials) => {
  if (!usesSupabaseEdgeAuth) {
    return parseAdminSession(
      await requestJson("/api/auth/login", {
        body: JSON.stringify(credentials),
        method: "POST",
      }),
    );
  }

  const loginResponse = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      body: JSON.stringify(credentials),
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );
  const loginBody = await parseJsonResponse(loginResponse);

  if (!loginResponse.ok || !isRecord(loginBody) || typeof loginBody.access_token !== "string") {
    throw new ApiRequestError(
      getResponseMessage(loginBody, "Invalid admin email or password."),
      loginResponse.status || 401,
      getResponseCode(loginBody),
    );
  }

  saveEdgeAuthSession(loginBody.access_token);
  const session = await getAdminSession();

  if (!session.authenticated) {
    clearEdgeAuthSession();
    throw new ApiRequestError("This account is not authorized to access the admin platform.", 403, "ADMIN_PERMISSION_REQUIRED");
  }

  return session;
};

export const logoutAdmin = async () => {
  if (!usesSupabaseEdgeAuth) {
    await requestJson("/api/auth/logout", { method: "POST" });
    return;
  }

  const session = getEdgeAuthSession();
  clearEdgeAuthSession();

  if (session) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.accessToken}`,
      },
      method: "POST",
    });
  }
};

export const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof ApiRequestError && error.message) {
    return error.message;
  }

  return fallback;
};
