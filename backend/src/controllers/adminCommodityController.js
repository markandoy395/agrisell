const {
  AdminCommodityError,
  createCommodity,
  listCommodities,
  setCommodityDetails,
  setCommodityStatus,
} = require('../services/adminCommodityService');
const { SupabaseRequestError } = require('../services/supabaseService');
const { readJsonBody, sendJson } = require('../utils/http');

const commodityError = (response, error) => {
  if (error instanceof AdminCommodityError) {
    sendJson(response, error.statusCode, { code: error.code, message: error.message });
    return;
  }
  console.error('Unable to manage commodities.', error);
  sendJson(response, error instanceof SupabaseRequestError ? 503 : 502, {
    code: 'COMMODITY_UNAVAILABLE',
    message: 'The commodity operation could not be completed. Please try again.',
  });
};

const getAdminCommodities = async (_request, response) => {
  try {
    const catalog = await listCommodities();
    sendJson(response, 200, catalog);
  } catch (error) {
    commodityError(response, error);
  }
};

const createAdminCommodity = async (request, response) => {
  try {
    const body = await readJsonBody(request, { maxBytes: 250_000 });
    const result = await createCommodity(body);
    sendJson(response, 201, result);
  } catch (error) {
    commodityError(response, error);
  }
};

const updateAdminCommodityStatus = async (request, response, commodityId) => {
  try {
    const body = await readJsonBody(request, { maxBytes: 250_000 });
    const result = await setCommodityStatus(commodityId, body?.status);
    sendJson(response, 200, result);
  } catch (error) {
    commodityError(response, error);
  }
};

const updateAdminCommodityDetails = async (request, response, commodityId) => {
  try {
    const body = await readJsonBody(request, { maxBytes: 250_000 });
    const result = await setCommodityDetails(commodityId, body);
    sendJson(response, 200, result);
  } catch (error) {
    commodityError(response, error);
  }
};

module.exports = {
  createAdminCommodity,
  getAdminCommodities,
  updateAdminCommodityDetails,
  updateAdminCommodityStatus,
};

