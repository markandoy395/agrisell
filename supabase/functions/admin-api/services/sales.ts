import { deleteRows, getTable, insertRow, insertRows, updateRows } from "../repository.ts";
import type { Row } from "../types.ts";
import { id, name, number, text } from "../value.ts";
import {
  normalizeSale, saleError, validateSale, type SaleInput,
} from "./saleValidation.ts";

const getSaleTables = async () => {
  const [sales, saleItems, commodities, categories, farms, users] = await Promise.all([
    getTable("product_sales"), getTable("product_sale_items"),
    getTable("commodities"), getTable("categories"),
    getTable("farms"), getTable("users"),
  ]);
  return { categories, commodities, farms, saleItems, sales, users };
};

const firstImage = (value: unknown) => {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return text(value.find((item) => typeof item === "string"));
  return "";
};

export const getSales = async () => {
  const { categories, commodities, farms, saleItems, sales, users } = await getSaleTables();
  const commodityNames = new Map(commodities.map((commodity) => [
    id(commodity.commodity_id), text(commodity.commodity_name, "Removed product"),
  ]));
  const categoriesById = new Map(categories.map((category) => [
    id(category.category_id), text(category.category_name, "Uncategorized"),
  ]));
  const farmsById = new Map(farms.map((farm) => [
    id(farm.farm_id), farm,
  ]));
  const usersById = new Map(users.map((user) => [
    id(user.user_id), user,
  ]));

  const mappedProducts = commodities.filter((commodity) => number(commodity.price_per_unit) > 0)
    .map((commodity) => {
      const farmId = commodity.farm_id ? id(commodity.farm_id) : null;
      const farm = farmId ? farmsById.get(farmId) : null;
      return {
        category: categoriesById.get(id(commodity.category_id)) ?? "Uncategorized",
        farmId,
        farmName: farm ? text(farm.farm_name, `Farm #${farmId}`) : null,
        id: id(commodity.commodity_id),
        imageUrl: firstImage(commodity.image_url ?? commodity.commodity_image_url ??
          commodity.photo_url ?? commodity.images),
        name: text(commodity.commodity_name, `Commodity ${id(commodity.commodity_id)}`),
        price: number(commodity.price_per_unit),
        stockQuantity: commodity.available_quantity == null
          ? null : number(commodity.available_quantity),
        stockStatus: text(commodity.commodity_status),
        unit: text(commodity.unit_type, "unit"),
      };
    });

  const mappedSales = sales.map((sale) => {
    const farmId = sale.farm_id ? id(sale.farm_id) : null;
    const farm = farmId ? farmsById.get(farmId) : null;
    const farmerUser = farm && farm.farmer_user_id ? usersById.get(id(farm.farmer_user_id)) : null;
    const farmerName = farmerUser ? name(farmerUser, `Farmer ${id(farm!.farmer_user_id)}`) : null;
    const farmName = farm ? text(farm.farm_name, `Farm #${farmId}`) : null;

    return {
      discountType: text(sale.discount_type),
      discountValue: number(sale.discount_value),
      endsAt: text(sale.ends_at) || null,
      farmId,
      farmName,
      farmerName,
      id: id(sale.sale_id),
      isEnabled: sale.is_enabled === true,
      name: text(sale.name, `Sale ${id(sale.sale_id)}`),
      products: saleItems.filter((item) => id(item.sale_id) === id(sale.sale_id))
        .map((item) => ({
          id: id(item.commodity_id),
          name: commodityNames.get(id(item.commodity_id)) ?? "Removed product",
        })),
      promoCode: text(sale.promo_code) || null,
      promoteOnHome: sale.promote_on_home === true,
      scope: (farmId ? "farmer" : "platform") as "farmer" | "platform",
      startsAt: text(sale.starts_at) || null,
      targetUserGroup: text(sale.target_user_group, "all_users"),
    };
  });

  const farmOptions = farms.map((f) => {
    const u = f.farmer_user_id ? usersById.get(id(f.farmer_user_id)) : null;
    return {
      farmerName: u ? name(u, `Farmer ${id(f.farmer_user_id)}`) : null,
      id: id(f.farm_id),
      location: text(f.farm_location ?? f.location, ""),
      name: text(f.farm_name, `Farm #${id(f.farm_id)}`),
    };
  });

  return {
    farms: farmOptions,
    products: mappedProducts,
    sales: mappedSales,
  };
};

export const createSale = async (payload: unknown) => {
  const sale = normalizeSale(payload);
  const { commodities, saleItems, sales } = await getSaleTables();
  validateSale(sale, commodities, sales, saleItems);
  const created = await insertRow("product_sales", {
    discount_type: sale.discountType, discount_value: sale.discountValue,
    ends_at: sale.endsAt, farm_id: sale.farmId ? number(sale.farmId) : null,
    is_enabled: true, name: sale.name,
    promo_code: sale.promoCode,
    promote_on_home: sale.promoteOnHome, starts_at: sale.startsAt,
    target_user_group: sale.targetUserGroup,
  });
  try {
    await insertRows("product_sale_items", sale.commodityIds.map((commodityId) => ({
      commodity_id: commodityId, sale_id: created.sale_id,
    })));
  } catch (error) {
    await deleteRows("product_sales", `sale_id=eq.${encodeURIComponent(id(created.sale_id))}`);
    throw error;
  }
  return created;
};

const existingSaleInput = (existing: Row, saleItems: Row[], saleId: string): SaleInput => ({
  commodityIds: saleItems.filter((item) => id(item.sale_id) === saleId)
    .map((item) => number(item.commodity_id)),
  discountType: text(existing.discount_type), discountValue: number(existing.discount_value),
  endsAt: text(existing.ends_at) || null,
  farmId: existing.farm_id ? id(existing.farm_id) : null,
  isEnabled: true, name: text(existing.name),
  promoCode: text(existing.promo_code) || null,
  promoteOnHome: existing.promote_on_home === true,
  startsAt: text(existing.starts_at) || null,
  targetUserGroup: text(existing.target_user_group),
});

export const updateSale = async (saleId: string, payload: unknown) => {
  const { commodities, saleItems, sales } = await getSaleTables();
  const existing = sales.find((sale) => id(sale.sale_id) === saleId);
  if (!existing) throw saleError("Sale not found.", 404);
  const body = typeof payload === "object" && payload !== null && !Array.isArray(payload)
    ? payload as Row : {};
  const existingFarmId = existing.farm_id ? id(existing.farm_id) : null;
  if (typeof body.isEnabled === "boolean" && Object.keys(body).length === 1) {
    if (body.isEnabled) validateSale(existingSaleInput(existing, saleItems, saleId), commodities, sales, saleItems, saleId);
    const updated = await updateRows("product_sales", `sale_id=eq.${encodeURIComponent(saleId)}`, {
      is_enabled: body.isEnabled, updated_at: new Date().toISOString(),
    });
    if (!updated[0]) throw saleError("Sale not found.", 404);
    return updated[0];
  }
  const sale = normalizeSale(
    body,
    existing.is_enabled === true,
    existing.promote_on_home === true,
    existingFarmId,
  );
  validateSale(sale, commodities, sales, saleItems, saleId);
  const updateData: Record<string, unknown> = {
    discount_type: sale.discountType, discount_value: sale.discountValue,
    ends_at: sale.endsAt, name: sale.name, promo_code: sale.promoCode, promote_on_home: sale.promoteOnHome,
    starts_at: sale.startsAt, target_user_group: sale.targetUserGroup,
    updated_at: new Date().toISOString(),
  };
  if (sale.farmId !== undefined) {
    updateData.farm_id = sale.farmId ? number(sale.farmId) : null;
  }
  const updated = await updateRows("product_sales", `sale_id=eq.${encodeURIComponent(saleId)}`, updateData);
  const currentIds = saleItems.filter((item) => id(item.sale_id) === saleId)
    .map((item) => number(item.commodity_id));
  await insertRows("product_sale_items", sale.commodityIds
    .filter((item) => !currentIds.includes(item))
    .map((commodityId) => ({ commodity_id: commodityId, sale_id: number(saleId) })));
  const removed = currentIds.filter((item) => !sale.commodityIds.includes(item));
  if (removed.length) await deleteRows(
    "product_sale_items",
    `sale_id=eq.${encodeURIComponent(saleId)}&commodity_id=in.(${removed.join(",")})`,
  );
  return updated[0];
};

export const removeSale = async (saleId: string) => {
  const removed = await deleteRows("product_sales", `sale_id=eq.${encodeURIComponent(saleId)}`);
  if (!removed[0]) throw saleError("Sale not found.", 404);
};
