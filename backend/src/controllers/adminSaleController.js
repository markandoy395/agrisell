const {
  AdminSaleError, createSale, listSaleProducts, listSales, removeSale,
  setSaleEnabled, updateSale,
} = require('../services/adminSaleService');
const { SupabaseRequestError } = require('../services/supabaseService');
const { readJsonBody, sendJson } = require('../utils/http');

const saleError = (response, error) => {
  if (error instanceof AdminSaleError) {
    sendJson(response, error.statusCode, { code: 'SALE_INVALID', message: error.message });
    return;
  }
  console.error('Unable to manage product sales.', error);
  sendJson(response, error instanceof SupabaseRequestError ? 503 : 502, {
    code: 'SALE_UNAVAILABLE',
    message: 'The sale could not be saved. Please try again.',
  });
};

const getAdminSales = async (_request, response) => {
  try {
    const [sales, products] = await Promise.all([listSales(), listSaleProducts()]);
    sendJson(response, 200, { sales, products });
  } catch (error) {
    saleError(response, error);
  }
};

const createAdminSale = async (request, response) => {
  try {
    const body = await readJsonBody(request, { maxBytes: 250_000 });
    sendJson(response, 201, { sale: await createSale(body) });
  } catch (error) {
    saleError(response, error);
  }
};

const updateAdminSaleEnabled = async (request, response, saleId) => {
  try {
    const body = await readJsonBody(request, { maxBytes: 250_000 });
    if (typeof body.isEnabled === 'boolean' && Object.keys(body).length === 1) {
      sendJson(response, 200, { sale: await setSaleEnabled(saleId, body.isEnabled) });
      return;
    }
    sendJson(response, 200, { sale: await updateSale(saleId, body) });
  } catch (error) {
    saleError(response, error);
  }
};

const deleteAdminSale = async (_request, response, saleId) => {
  try {
    await removeSale(saleId);
    sendJson(response, 204, {});
  } catch (error) {
    saleError(response, error);
  }
};

module.exports = {
  createAdminSale, deleteAdminSale, getAdminSales, updateAdminSaleEnabled,
};
