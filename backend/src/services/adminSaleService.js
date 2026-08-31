const {
  getSupabaseRows,
  insertSupabaseRow,
  insertSupabaseRows,
  updateSupabaseRows,
  deleteSupabaseRows,
} = require('./supabaseService');

class AdminSaleError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const number = (value) => (typeof value === 'number' ? value : Number(value));
const firstText = (value) => {
  if (typeof value === 'string') return value.trim();
  if (Array.isArray(value)) return text(value.find((item) => typeof item === 'string'));
  return '';
};

const rangesOverlap = (first, second) => {
  const firstStart = first.startsAt ? new Date(first.startsAt).getTime() : -Infinity;
  const firstEnd = first.endsAt ? new Date(first.endsAt).getTime() : Infinity;
  const secondStart = second.startsAt ? new Date(second.startsAt).getTime() : -Infinity;
  const secondEnd = second.endsAt ? new Date(second.endsAt).getTime() : Infinity;
  return firstStart < secondEnd && secondStart < firstEnd;
};

const normalizeSale = (input) => {
  const name = text(input.name);
  const discountType = text(input.discountType);
  const targetUserGroup = text(input.targetUserGroup);
  const promoteOnHome = input.promoteOnHome === true;
  const discountValue = number(input.discountValue);
  const commodityIds = Array.isArray(input.commodityIds)
    ? [...new Set(input.commodityIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))]
    : [];
  if (!name || !['sale_price', 'percentage', 'amount'].includes(discountType)) {
    throw new AdminSaleError('Enter a sale name and a valid discount type.');
  }
  if (!['all_users', 'new_users_only'].includes(targetUserGroup) || !Number.isFinite(discountValue) || discountValue <= 0) {
    throw new AdminSaleError('Enter a valid discount and target user group.');
  }
  if (commodityIds.length === 0) throw new AdminSaleError('Select at least one product.');
  if (promoteOnHome && commodityIds.length < 2) {
    throw new AdminSaleError('Home promotion is available only for campaigns with at least two products.');
  }
  const startsAt = text(input.startsAt) || null;
  const endsAt = text(input.endsAt) || null;
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
    throw new AdminSaleError('The end date must be after the start date.');
  }
  return { name, discountType, discountValue, targetUserGroup, commodityIds, startsAt, endsAt, promoteOnHome, isEnabled: input.isEnabled !== false };
};

const assertNoSaleConflicts = ({ sale, sales, saleItems, excludeSaleId }) => {
  if (!sale.isEnabled) return;
  const conflict = sales.find((existing) => {
    if (!existing.is_enabled || String(existing.sale_id) === String(excludeSaleId ?? '')) return false;
    const existingRange = { startsAt: existing.starts_at, endsAt: existing.ends_at };
    if (!rangesOverlap(sale, existingRange)) return false;
    return saleItems.some((item) =>
      String(item.sale_id) === String(existing.sale_id) &&
      sale.commodityIds.includes(Number(item.commodity_id))
    );
  });
  if (conflict) {
    throw new AdminSaleError(`A selected product already has an overlapping promotion: ${conflict.name}.`);
  }
};

const validateSaleProducts = (sale, commodities) => {
  const selected = commodities.filter((commodity) => sale.commodityIds.includes(Number(commodity.commodity_id)));
  if (selected.length !== sale.commodityIds.length) throw new AdminSaleError('One or more selected products no longer exist.');
  for (const commodity of selected) {
    const original = Number(commodity.price_per_unit);
    const finalPrice = sale.discountType === 'sale_price' ? sale.discountValue
      : sale.discountType === 'percentage' ? original * (1 - sale.discountValue / 100)
        : original - sale.discountValue;
    if (!(finalPrice > 0 && finalPrice < original)) {
      throw new AdminSaleError(`The sale must lower ${commodity.commodity_name}'s original price.`);
    }
  }
};

const createSale = async (input) => {
  const sale = normalizeSale(input);
  const [commodities, sales, saleItems] = await Promise.all([
    getSupabaseRows('commodities'), getSupabaseRows('product_sales'), getSupabaseRows('product_sale_items'),
  ]);
  validateSaleProducts(sale, commodities);
  assertNoSaleConflicts({ sale, sales, saleItems });
  const created = await insertSupabaseRow('product_sales', {
    name: sale.name, discount_type: sale.discountType, discount_value: sale.discountValue,
    target_user_group: sale.targetUserGroup, starts_at: sale.startsAt, ends_at: sale.endsAt,
    promote_on_home: sale.promoteOnHome,
    is_enabled: sale.isEnabled,
  });
  try {
    await insertSupabaseRows('product_sale_items', sale.commodityIds.map((commodityId) => ({
      sale_id: created.sale_id,
      commodity_id: commodityId,
    })));
  } catch (error) {
    await deleteSupabaseRows('product_sales', { sale_id: `eq.${Number(created.sale_id)}` });
    throw error;
  }
  return created;
};

const updateSale = async (saleId, input) => {
  const [commodities, sales, saleItems] = await Promise.all([
    getSupabaseRows('commodities'), getSupabaseRows('product_sales'), getSupabaseRows('product_sale_items'),
  ]);
  const existing = sales.find((item) => String(item.sale_id) === String(saleId));
  if (!existing) throw new AdminSaleError('Sale not found.', 404);
  const sale = normalizeSale({
    ...input,
    isEnabled: existing.is_enabled,
    promoteOnHome: typeof input.promoteOnHome === 'boolean'
      ? input.promoteOnHome
      : existing.promote_on_home === true,
  });
  validateSaleProducts(sale, commodities);
  assertNoSaleConflicts({ sale, sales, saleItems, excludeSaleId: saleId });
  const updated = await updateSupabaseRows('product_sales', { sale_id: `eq.${Number(saleId)}` }, {
    name: sale.name,
    discount_type: sale.discountType,
    discount_value: sale.discountValue,
    target_user_group: sale.targetUserGroup,
    promote_on_home: sale.promoteOnHome,
    starts_at: sale.startsAt,
    ends_at: sale.endsAt,
    updated_at: new Date().toISOString(),
  });
  const currentIds = saleItems
    .filter((item) => String(item.sale_id) === String(saleId))
    .map((item) => Number(item.commodity_id));
  const addedIds = sale.commodityIds.filter((id) => !currentIds.includes(id));
  await insertSupabaseRows('product_sale_items', addedIds.map((commodityId) => ({
    sale_id: Number(saleId),
    commodity_id: commodityId,
  })));
  const removedIds = currentIds.filter((id) => !sale.commodityIds.includes(id));
  if (removedIds.length > 0) {
    await deleteSupabaseRows('product_sale_items', {
      sale_id: `eq.${Number(saleId)}`,
      commodity_id: `in.(${removedIds.join(',')})`,
    });
  }
  return updated[0];
};

const listSales = async () => {
  const [sales, saleItems, commodities] = await Promise.all([
    getSupabaseRows('product_sales'), getSupabaseRows('product_sale_items'), getSupabaseRows('commodities'),
  ]);
  const commodityNames = new Map(commodities.map((item) => [String(item.commodity_id), item.commodity_name]));
  return sales.map((sale) => ({
    id: String(sale.sale_id), name: sale.name, discountType: sale.discount_type,
    discountValue: Number(sale.discount_value), targetUserGroup: sale.target_user_group,
    startsAt: sale.starts_at, endsAt: sale.ends_at, isEnabled: sale.is_enabled,
    promoteOnHome: sale.promote_on_home === true,
    products: saleItems.filter((item) => String(item.sale_id) === String(sale.sale_id))
      .map((item) => ({ id: String(item.commodity_id), name: commodityNames.get(String(item.commodity_id)) ?? 'Removed product' })),
  }));
};

const listSaleProducts = async () => {
  const [commodities, categories] = await Promise.all([
    getSupabaseRows('commodities'), getSupabaseRows('categories'),
  ]);
  const categoriesById = new Map(categories.map((category) => [String(category.category_id), category.category_name]));
  return commodities
    .filter((commodity) => Number(commodity.price_per_unit) > 0)
    .map((commodity) => ({
      id: String(commodity.commodity_id),
      name: commodity.commodity_name,
      price: Number(commodity.price_per_unit),
      unit: commodity.unit_type,
      category: categoriesById.get(String(commodity.category_id)) ?? 'Uncategorized',
      imageUrl: firstText(commodity.image_url ?? commodity.commodity_image_url ?? commodity.photo_url ?? commodity.images),
      stockQuantity: commodity.available_quantity === null || commodity.available_quantity === undefined
        ? null
        : Number(commodity.available_quantity),
      stockStatus: text(commodity.commodity_status),
    }));
};

const setSaleEnabled = async (saleId, isEnabled) => {
  if (isEnabled) {
    const [sales, saleItems] = await Promise.all([
      getSupabaseRows('product_sales'), getSupabaseRows('product_sale_items'),
    ]);
    const existing = sales.find((item) => String(item.sale_id) === String(saleId));
    if (!existing) throw new AdminSaleError('Sale not found.', 404);
    const sale = {
      commodityIds: saleItems.filter((item) => String(item.sale_id) === String(saleId)).map((item) => Number(item.commodity_id)),
      endsAt: existing.ends_at,
      isEnabled: true,
      startsAt: existing.starts_at,
    };
    assertNoSaleConflicts({ sale, sales, saleItems, excludeSaleId: saleId });
  }
  const updated = await updateSupabaseRows('product_sales', { sale_id: `eq.${Number(saleId)}` }, { is_enabled: isEnabled, updated_at: new Date().toISOString() });
  if (!updated[0]) throw new AdminSaleError('Sale not found.', 404);
  return updated[0];
};

const removeSale = async (saleId) => {
  const deleted = await deleteSupabaseRows('product_sales', { sale_id: `eq.${Number(saleId)}` });
  if (!deleted[0]) throw new AdminSaleError('Sale not found.', 404);
};

module.exports = {
  AdminSaleError, createSale, listSaleProducts, listSales, removeSale, setSaleEnabled, updateSale,
};
