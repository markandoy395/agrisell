// Normalizes sales and enforces product promotion rules.
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
    ? [...new Set(input.commodityIds.map(Number)
      .filter((itemId) => Number.isInteger(itemId) && itemId > 0))]
    : [];
  if (!name || !['sale_price', 'percentage', 'amount'].includes(discountType)) {
    throw new AdminSaleError('Enter a sale name and a valid discount type.');
  }
  if (!['all_users', 'new_users_only'].includes(targetUserGroup) ||
    !Number.isFinite(discountValue) || discountValue <= 0) {
    throw new AdminSaleError('Enter a valid discount and target user group.');
  }
  if (commodityIds.length === 0) throw new AdminSaleError('Select at least one product.');
  if (promoteOnHome && commodityIds.length < 2) {
    throw new AdminSaleError(
      'Home promotion is available only for campaigns with at least two products.',
    );
  }
  const startsAt = text(input.startsAt) || null;
  const endsAt = text(input.endsAt) || null;
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
    throw new AdminSaleError('The end date must be after the start date.');
  }
  const promoCode = text(input.promoCode).toUpperCase() || null;
  return {
    commodityIds, discountType, discountValue, endsAt,
    isEnabled: input.isEnabled !== false, name, promoCode, promoteOnHome, startsAt, targetUserGroup,
  };
};

const assertNoSaleConflicts = ({ sale, sales, saleItems, excludeSaleId }) => {
  if (!sale.isEnabled) return;
  const conflict = sales.find((existing) => {
    if (!existing.is_enabled || String(existing.sale_id) === String(excludeSaleId ?? '')) {
      return false;
    }
    if (!rangesOverlap(sale, {
      startsAt: existing.starts_at, endsAt: existing.ends_at,
    })) return false;
    return saleItems.some((item) =>
      String(item.sale_id) === String(existing.sale_id) &&
      sale.commodityIds.includes(Number(item.commodity_id)));
  });
  if (conflict) {
    throw new AdminSaleError(
      `A selected product already has an overlapping promotion: ${conflict.name}.`,
    );
  }
};

const validateSaleProducts = (sale, commodities) => {
  const selected = commodities.filter((commodity) =>
    sale.commodityIds.includes(Number(commodity.commodity_id)));
  if (selected.length !== sale.commodityIds.length) {
    throw new AdminSaleError('One or more selected products no longer exist.');
  }
  for (const commodity of selected) {
    const original = Number(commodity.price_per_unit);
    const finalPrice = sale.discountType === 'sale_price' ? sale.discountValue
      : sale.discountType === 'percentage' ? original * (1 - sale.discountValue / 100)
        : original - sale.discountValue;
    if (!(finalPrice > 0 && finalPrice < original)) {
      throw new AdminSaleError(
        `The sale must lower ${commodity.commodity_name}'s original price.`,
      );
    }
  }
};

module.exports = {
  AdminSaleError, assertNoSaleConflicts, firstText, normalizeSale, text, validateSaleProducts,
};
