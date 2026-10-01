import type { Row } from "../types.ts";
import { createApiError, id, number, text } from "../value.ts";

export type SaleInput = {
  commodityIds: number[];
  discountType: string;
  discountValue: number;
  endsAt: string | null;
  farmId: string | null;
  isEnabled: boolean;
  name: string;
  promoCode: string | null;
  promoteOnHome: boolean;
  startsAt: string | null;
  targetUserGroup: string;
};

export const saleError = (message: string, status = 400) =>
  createApiError("SALE_INVALID", message, status);

export const normalizeSale = (
  payload: unknown,
  isEnabled = true,
  existingPromoteOnHome = false,
  existingFarmId: string | null = null,
): SaleInput => {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw saleError("Enter the promotion details.");
  }
  const body = payload as Row;
  const saleName = text(body.name);
  const discountType = text(body.discountType);
  const targetUserGroup = text(body.targetUserGroup);
  const promoCode = text(body.promoCode).toUpperCase() || null;
  const promoteOnHome = typeof body.promoteOnHome === "boolean"
    ? body.promoteOnHome : existingPromoteOnHome;
  const discountValue = number(body.discountValue, Number.NaN);
  const commodityIds = Array.isArray(body.commodityIds)
    ? [...new Set(body.commodityIds.map(Number)
      .filter((item) => Number.isInteger(item) && item > 0))] : [];
  if (!saleName || !["sale_price", "percentage", "amount"].includes(discountType)) {
    throw saleError("Enter a sale name and a valid discount type.");
  }
  if (!["all_users", "new_users_only"].includes(targetUserGroup) ||
    !Number.isFinite(discountValue) || discountValue <= 0) {
    throw saleError("Enter a valid discount and target user group.");
  }
  if (!commodityIds.length) throw saleError("Select at least one product.");
  if (promoteOnHome && commodityIds.length < 2) {
    throw saleError(
      "Home promotion is available only for campaigns with at least two products.",
    );
  }
  const startsAt = text(body.startsAt) || null;
  const endsAt = text(body.endsAt) || null;
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
    throw saleError("The end date must be after the start date.");
  }
  const rawFarmId = text(body.farmId) || existingFarmId || null;
  const farmId = rawFarmId && rawFarmId !== "platform" ? rawFarmId : null;
  return {
    commodityIds, discountType, discountValue, endsAt, farmId, isEnabled,
    name: saleName, promoCode, promoteOnHome, startsAt, targetUserGroup,
  };
};

const rangesOverlap = (first: SaleInput, second: Row) => {
  const firstStart = first.startsAt ? new Date(first.startsAt).getTime() : -Infinity;
  const firstEnd = first.endsAt ? new Date(first.endsAt).getTime() : Infinity;
  const secondStart = text(second.starts_at)
    ? new Date(text(second.starts_at)).getTime() : -Infinity;
  const secondEnd = text(second.ends_at)
    ? new Date(text(second.ends_at)).getTime() : Infinity;
  return firstStart < secondEnd && secondStart < firstEnd;
};

export const validateSale = (
  sale: SaleInput,
  commodities: Row[],
  sales: Row[],
  saleItems: Row[],
  excludeSaleId = "",
) => {
  const selected = commodities.filter((commodity) =>
    sale.commodityIds.includes(number(commodity.commodity_id)));
  if (selected.length !== sale.commodityIds.length) {
    throw saleError("One or more selected products no longer exist.");
  }
  if (sale.farmId) {
    const foreignProduct = selected.find(
      (commodity) => id(commodity.farm_id) !== id(sale.farmId),
    );
    if (foreignProduct) {
      throw saleError(
        `The promotion is scoped to a specific farm. "${text(foreignProduct.commodity_name, "Selected product")}" belongs to another farm.`,
      );
    }
  }
  selected.forEach((commodity) => {
    const original = number(commodity.price_per_unit);
    const finalPrice = sale.discountType === "sale_price" ? sale.discountValue
      : sale.discountType === "percentage" ? original * (1 - sale.discountValue / 100)
        : original - sale.discountValue;
    if (!(finalPrice > 0 && finalPrice < original)) {
      throw saleError(
        `The sale must lower ${text(commodity.commodity_name, "the product")}'s original price.`,
      );
    }
  });
  if (!sale.isEnabled) return;
  const conflict = sales.find((existing) => existing.is_enabled === true &&
    id(existing.sale_id) !== excludeSaleId && rangesOverlap(sale, existing) &&
    saleItems.some((item) => id(item.sale_id) === id(existing.sale_id) &&
      sale.commodityIds.includes(number(item.commodity_id))));
  if (conflict) {
    throw saleError(
      `A selected product already has an overlapping promotion: ${text(conflict.name, "Existing sale")}.`,
    );
  }
};
