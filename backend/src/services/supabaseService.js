const {
  getSupabaseUrl,
  requestSupabase,
  requestSupabaseAuth,
  SupabaseRequestError,
} = require('../modules/shared/supabase/supabaseRequest');
const {
  signSupabaseProfileImage,
  uploadSupabaseProfileImage,
} = require('../modules/shared/supabase/supabaseStorageService');

const requireRows = (body, message) => {
  if (!Array.isArray(body)) {
    throw new SupabaseRequestError('DATABASE_INVALID_RESPONSE', message);
  }
  return body;
};

const getSupabaseRows = async (table, filters) => {
  const body = await requestSupabase(getSupabaseUrl(table, filters));
  return requireRows(body, 'Supabase returned an invalid table response.');
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
      'DATABASE_INVALID_RESPONSE', 'Supabase did not return the inserted record.',
    );
  }
  return body[0];
};

const upsertSupabaseRow = async (table, row) => {
  const body = await requestSupabase(getSupabaseUrl(table), {
    body: JSON.stringify(row),
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    method: 'POST',
  });
  if (!Array.isArray(body) || !body[0] || typeof body[0] !== 'object') {
    throw new SupabaseRequestError(
      'DATABASE_INVALID_RESPONSE', 'Supabase did not return the saved record.',
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
      'DATABASE_INVALID_RESPONSE', 'Supabase did not return all inserted records.',
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
  return requireRows(body, 'Supabase did not return the updated records.');
};

const deleteSupabaseRows = async (table, filters) => {
  const body = await requestSupabase(getSupabaseUrl(table, filters), {
    headers: { Prefer: 'return=representation' },
    method: 'DELETE',
  });
  return requireRows(body, 'Supabase did not return the deleted records.');
};

module.exports = {
  deleteSupabaseRows,
  getSupabaseRows,
  insertSupabaseRow,
  insertSupabaseRows,
  requestSupabaseAuth,
  SupabaseRequestError,
  updateSupabaseRows,
  signSupabaseProfileImage,
  uploadSupabaseProfileImage,
  upsertSupabaseRow,
};
