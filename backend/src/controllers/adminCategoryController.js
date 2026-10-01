const {
  AdminCategoryError,
  createCategory,
  listCategories,
  reorderCategories,
  setCategoryStatus,
  updateCategory,
} = require('../services/adminCategoryService');
const { SupabaseRequestError } = require('../services/supabaseService');
const { readJsonBody, sendJson } = require('../utils/http');

const categoryError = (response, error) => {
  if (error instanceof AdminCategoryError) {
    sendJson(response, error.statusCode, { code: error.code, message: error.message });
    return;
  }
  console.error('Unable to manage produce categories.', error);
  sendJson(response, error instanceof SupabaseRequestError ? 503 : 502, {
    code: 'CATEGORY_UNAVAILABLE',
    message: 'The category operation could not be completed. Please try again.',
  });
};

const getAdminCategories = async (_request, response) => {
  try {
    const result = await listCategories();
    sendJson(response, 200, result);
  } catch (error) {
    categoryError(response, error);
  }
};

const createAdminCategory = async (request, response) => {
  try {
    const body = await readJsonBody(request, { maxBytes: 100_000 });
    const category = await createCategory(body);
    sendJson(response, 201, { category });
  } catch (error) {
    categoryError(response, error);
  }
};

const updateAdminCategory = async (request, response, categoryId) => {
  try {
    const body = await readJsonBody(request, { maxBytes: 100_000 });
    const category = await updateCategory(categoryId, body);
    sendJson(response, 200, { category });
  } catch (error) {
    categoryError(response, error);
  }
};

const updateAdminCategoryStatus = async (request, response, categoryId) => {
  try {
    const body = await readJsonBody(request, { maxBytes: 100_000 });
    const status = typeof body.status === 'string' ? body.status : '';
    const category = await setCategoryStatus(categoryId, status);
    sendJson(response, 200, { category });
  } catch (error) {
    categoryError(response, error);
  }
};

const reorderAdminCategories = async (request, response) => {
  try {
    const body = await readJsonBody(request, { maxBytes: 100_000 });
    const orderedIds = Array.isArray(body?.orderedIds) ? body.orderedIds : [];
    const result = await reorderCategories(orderedIds);
    sendJson(response, 200, result);
  } catch (error) {
    categoryError(response, error);
  }
};

module.exports = {
  createAdminCategory,
  getAdminCategories,
  reorderAdminCategories,
  updateAdminCategory,
  updateAdminCategoryStatus,
};
