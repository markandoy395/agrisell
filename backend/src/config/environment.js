const crypto = require('node:crypto');
const { loadBackendLocalEnv } = require('./loadEnvFile');

loadBackendLocalEnv();

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
];
const DEFAULT_DEV_FRONTEND_PORT_MIN = 5173;
const DEFAULT_DEV_FRONTEND_PORT_MAX = 5199;
const DEFAULT_SESSION_TTL_SECONDS = 8 * 60 * 60;

const normalizeEmail = (email) => email.trim().toLowerCase();

const parsePort = (value) => {
  const port = Number.parseInt(value ?? '3001', 10);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  return port;
};

const parsePositiveInteger = (value, fallback, name) => {
  if (!value) return fallback;

  const parsed = Number.parseInt(value, 10);

  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsed;
};

const parseAllowedOrigins = (value, isProduction) => {
  if (!value) {
    return isProduction ? [] : DEFAULT_DEV_ORIGINS;
  }

  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
};

const parseSameSite = (value) => {
  const normalizedValue = value?.trim().toLowerCase();

  if (!normalizedValue) return 'Strict';
  if (normalizedValue === 'strict') return 'Strict';
  if (normalizedValue === 'lax') return 'Lax';
  if (normalizedValue === 'none') return 'None';

  throw new Error('SESSION_COOKIE_SAMESITE must be Strict, Lax, or None.');
};

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';
const adminEmail = normalizeEmail(process.env.ADMIN_EMAIL ?? '');
const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH ?? '';
const adminPassword = isProduction ? '' : (process.env.ADMIN_PASSWORD ?? '');
const supabaseUrl = (process.env.SUPABASE_URL ?? '').replace(/\/+$/, '');
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const hasAdminCredentials = Boolean(
  adminEmail && (adminPasswordHash || adminPassword),
);
const sessionSecret =
  process.env.ADMIN_SESSION_SECRET ??
  (isProduction ? '' : crypto.randomBytes(32).toString('base64url'));
const secureCookies = process.env.SECURE_COOKIES === 'true' || isProduction;
const sessionCookieSameSite = parseSameSite(process.env.SESSION_COOKIE_SAMESITE);

if (isProduction && !sessionSecret) {
  throw new Error('ADMIN_SESSION_SECRET is required in production.');
}

if (
  isProduction &&
  !Boolean(supabaseUrl && supabaseServiceRoleKey) &&
  (!adminEmail || !adminPasswordHash)
) {
  throw new Error(
    'Configure SUPABASE_URL with SUPABASE_SERVICE_ROLE_KEY or ADMIN_EMAIL with ADMIN_PASSWORD_HASH in production.',
  );
}

if (!isProduction && !process.env.ADMIN_SESSION_SECRET) {
  console.warn(
    'ADMIN_SESSION_SECRET is not set. A temporary development session secret was generated for this server process.',
  );
}

if (!isProduction && !hasAdminCredentials && !(supabaseUrl && supabaseServiceRoleKey)) {
  console.warn(
    'Admin login is not configured. Set ADMIN_EMAIL with ADMIN_PASSWORD or ADMIN_PASSWORD_HASH to enable backend login.',
  );
}

if (sessionCookieSameSite === 'None' && !secureCookies) {
  throw new Error('SESSION_COOKIE_SAMESITE=None requires SECURE_COOKIES=true.');
}

const config = {
  adminEmail,
  adminPassword,
  adminPasswordHash,
  allowedOrigins: parseAllowedOrigins(process.env.ALLOWED_ORIGINS, isProduction),
  allowLocalViteOrigins:
    !isProduction && process.env.ALLOW_LOCAL_VITE_ORIGINS !== 'false',
  localVitePortMax: DEFAULT_DEV_FRONTEND_PORT_MAX,
  localVitePortMin: DEFAULT_DEV_FRONTEND_PORT_MIN,
  hasAdminCredentials,
  isProduction,
  nodeEnv,
  port: parsePort(process.env.PORT),
  requireHttps:
    process.env.REQUIRE_HTTPS === 'true' ||
    (isProduction && process.env.REQUIRE_HTTPS !== 'false'),
  secureCookies,
  sessionCookieName: 'agrisell_admin_session',
  sessionCookieSameSite,
  sessionSecret,
  supabaseQueryLimit: parsePositiveInteger(
    process.env.SUPABASE_QUERY_LIMIT,
    1_000,
    'SUPABASE_QUERY_LIMIT',
  ),
  supabaseServiceRoleKey,
  supabaseUrl,
  hasSupabaseAdminAccess: Boolean(supabaseUrl && supabaseServiceRoleKey),
  sessionTtlSeconds: parsePositiveInteger(
    process.env.ADMIN_SESSION_TTL_SECONDS,
    DEFAULT_SESSION_TTL_SECONDS,
    'ADMIN_SESSION_TTL_SECONDS',
  ),
};

module.exports = { config, normalizeEmail };
