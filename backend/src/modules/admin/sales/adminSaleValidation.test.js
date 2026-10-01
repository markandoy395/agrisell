// Covers administrator sale validation rules.
const assert = require('node:assert/strict');
const test = require('node:test');
const {
  AdminSaleError,
  assertNoSaleConflicts,
  normalizeSale,
  validateSaleProducts,
} = require('./adminSaleValidation');

const validSale = {
  commodityIds: [3, 3, 4],
  discountType: 'percentage',
  discountValue: 10,
  endsAt: '2026-09-30T00:00:00Z',
  name: 'Harvest sale',
  startsAt: '2026-09-20T00:00:00Z',
  targetUserGroup: 'all_users',
};

test('normalizes sale input and removes duplicate product IDs', () => {
  assert.deepEqual(normalizeSale(validSale), {
    commodityIds: [3, 4],
    discountType: 'percentage',
    discountValue: 10,
    endsAt: '2026-09-30T00:00:00Z',
    isEnabled: true,
    name: 'Harvest sale',
    promoCode: null,
    promoteOnHome: false,
    startsAt: '2026-09-20T00:00:00Z',
    targetUserGroup: 'all_users',
  });
});

test('rejects invalid sale date ranges', () => {
  assert.throws(
    () => normalizeSale({
      ...validSale,
      endsAt: validSale.startsAt,
    }),
    AdminSaleError,
  );
});

test('rejects discounts that do not lower the product price', () => {
  const sale = normalizeSale({ ...validSale, commodityIds: [3], discountValue: 100 });
  assert.throws(
    () => validateSaleProducts(sale, [{
      commodity_id: 3, commodity_name: 'Tomato', price_per_unit: 50,
    }]),
    /must lower Tomato's original price/,
  );
});

test('detects enabled overlapping sales for the same product', () => {
  const sale = normalizeSale({ ...validSale, commodityIds: [3] });
  assert.throws(() => assertNoSaleConflicts({
    sale,
    saleItems: [{ commodity_id: 3, sale_id: 8 }],
    sales: [{
      ends_at: '2026-09-25T00:00:00Z',
      is_enabled: true,
      name: 'Existing sale',
      sale_id: 8,
      starts_at: '2026-09-15T00:00:00Z',
    }],
  }), /Existing sale/);
});
