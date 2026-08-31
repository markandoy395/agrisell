const { config } = require('../config/environment');

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
    if (typeof value === 'string' && value) {
      url.searchParams.set(name, value);
    }
  });

  return url;
};

const readErrorMessage = async (response) => {
  try {
    const body = await response.json();

    if (body && typeof body.message === 'string') {
      return body.message;
    }
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
      'DATABASE_REQUEST_FAILED',
      await readErrorMessage(response),
      response.status,
    );
  }

  const text = await response.text();

  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    throw new SupabaseRequestError(
      'DATABASE_INVALID_RESPONSE',
      'Supabase returned an invalid response.',
      response.status,
    );
  }
};

const getSupabaseRows = async (table, filters) => {
  const body = await requestSupabase(getSupabaseUrl(table, filters));

  if (!Array.isArray(body)) {
    throw new SupabaseRequestError(
      'DATABASE_INVALID_RESPONSE',
      'Supabase returned an invalid table response.',
    );
  }

  return body;
};

const insertSupabaseRow = async (table, row) => {
  const body = await requestSupabase(getSupabaseUrl(table), {
    body: JSON.stringify(row),
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    method: 'POST',
  });

  if (!Array.isArray(body) || !body[0] || typeof body[0] !== 'object') {
    throw new SupabaseRequestError(
      'DATABASE_INVALID_RESPONSE',
      'Supabase did not return the inserted record.',
    );
  }

  return body[0];
};

const insertSupabaseRows = async (table, rows) => {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const body = await requestSupabase(getSupabaseUrl(table), {
    body: JSON.stringify(rows),
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    method: 'POST',
  });
  if (!Array.isArray(body) || body.length !== rows.length) {
    throw new SupabaseRequestError(
      'DATABASE_INVALID_RESPONSE',
      'Supabase did not return all inserted records.',
    );
  }
  return body;
};

const updateSupabaseRows = async (table, filters, updates) => {
  const body = await requestSupabase(getSupabaseUrl(table, filters), {
    body: JSON.stringify(updates),
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    method: 'PATCH',
  });

  if (!Array.isArray(body)) {
    throw new SupabaseRequestError(
      'DATABASE_INVALID_RESPONSE',
      'Supabase did not return the updated records.',
    );
  }

  return body;
};

const deleteSupabaseRows = async (table, filters) => {
  const body = await requestSupabase(getSupabaseUrl(table, filters), {
    headers: { Prefer: 'return=representation' },
    method: 'DELETE',
  });
  if (!Array.isArray(body)) {
    throw new SupabaseRequestError(
      'DATABASE_INVALID_RESPONSE',
      'Supabase did not return the deleted records.',
    );
  }
  return body;
};

const requestSupabaseAuth = async (pathname, options = {}) =>
  requestSupabase(new URL(pathname, config.supabaseUrl), options);

module.exports = {
  SupabaseRequestError,
  deleteSupabaseRows,
  getSupabaseRows,
  insertSupabaseRow,
  insertSupabaseRows,
  requestSupabaseAuth,
  updateSupabaseRows,
};
