// Provides authenticated HTTP transport for Supabase administration APIs.
const { config } = require('../../../config/environment');

class SupabaseRequestError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const ensureConfigured = () => {
  if (!config.hasSupabaseAdminAccess) {
    throw new SupabaseRequestError(
      'DATABASE_NOT_CONFIGURED',
      'Supabase admin access is not configured.',
    );
  }
};

const getSupabaseUrl = (table, filters = {}) => {
  const url = new URL(`/rest/v1/${table}`, config.supabaseUrl);
  url.searchParams.set('select', '*');
  url.searchParams.set('limit', String(config.supabaseQueryLimit));
  Object.entries(filters).forEach(([name, value]) => {
    if (typeof value === 'string' && value) url.searchParams.set(name, value);
  });
  return url;
};

const readErrorMessage = async (response) => {
  try {
    const body = await response.json();
    if (body && typeof body.message === 'string') return body.message;
  } catch {
    // The Supabase response body is optional and should not mask the request.
  }
  return `Supabase returned HTTP ${response.status}.`;
};

const getSupabaseHeaders = (headers = {}) => ({
  Accept: 'application/json',
  apikey: config.supabaseServiceRoleKey,
  Authorization: `Bearer ${config.supabaseServiceRoleKey}`,
  ...headers,
});

const requestSupabase = async (url, options = {}) => {
  ensureConfigured();
  let response;
  try {
    response = await fetch(url, {
      ...options,
      headers: getSupabaseHeaders(options.headers),
    });
  } catch (error) {
    throw new SupabaseRequestError(
      'DATABASE_UNAVAILABLE',
      error instanceof Error ? error.message : 'Unable to reach Supabase.',
    );
  }
  if (!response.ok) {
    throw new SupabaseRequestError(
      'DATABASE_REQUEST_FAILED', await readErrorMessage(response), response.status,
    );
  }
  const responseText = await response.text();
  if (!responseText) return null;
  try {
    return JSON.parse(responseText);
  } catch {
    throw new SupabaseRequestError(
      'DATABASE_INVALID_RESPONSE',
      'Supabase returned an invalid response.',
      response.status,
    );
  }
};

const requestSupabaseAuth = (pathname, options = {}) =>
  requestSupabase(new URL(pathname, config.supabaseUrl), options);

module.exports = {
  getSupabaseUrl,
  requestSupabase,
  requestSupabaseAuth,
  SupabaseRequestError,
};
