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

const PROFILE_IMAGE_BUCKET = 'admin-profile-images';

const uploadSupabaseProfileImage = async (userId, dataUrl) => {
  try {
    await requestSupabase(
      new URL(`/storage/v1/bucket/${PROFILE_IMAGE_BUCKET}`, config.supabaseUrl),
    );
  } catch (error) {
    if (!(error instanceof SupabaseRequestError) || ![400, 404].includes(error.status)) throw error;
    try {
      await requestSupabase(new URL('/storage/v1/bucket', config.supabaseUrl), {
        body: JSON.stringify({
          allowed_mime_types: ['image/webp'],
          file_size_limit: 500_000,
          id: PROFILE_IMAGE_BUCKET,
          name: PROFILE_IMAGE_BUCKET,
          public: true,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
    } catch (createError) {
      // Another request may have created the bucket between the lookup and create calls.
      if (!(createError instanceof SupabaseRequestError) || createError.status !== 409) {
        throw createError;
      }
    }
  }

  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const objectPath = `${encodeURIComponent(String(userId))}/avatar.webp`;
  await requestSupabase(
    new URL(`/storage/v1/object/${PROFILE_IMAGE_BUCKET}/${objectPath}`, config.supabaseUrl),
    {
      body: Buffer.from(base64, 'base64'),
      headers: { 'Content-Type': 'image/webp', 'x-upsert': 'true' },
      method: 'POST',
    },
  );

  return `${config.supabaseUrl}/storage/v1/object/public/${PROFILE_IMAGE_BUCKET}/${objectPath}?v=${Date.now()}`;
};

module.exports = {
  SupabaseRequestError,
  deleteSupabaseRows,
  getSupabaseRows,
  insertSupabaseRow,
  insertSupabaseRows,
  requestSupabaseAuth,
  uploadSupabaseProfileImage,
  updateSupabaseRows,
};
