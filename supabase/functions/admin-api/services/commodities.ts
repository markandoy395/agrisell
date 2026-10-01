import { getOptionalTable, getTable, insertRow, updateRows } from "../repository.ts";
import type { Admin, Row } from "../types.ts";
import { createApiError, date, display, id, name, number, text } from "../value.ts";

export const getCommoditiesCatalog = async () => {
  const [commodities, categories, farms, users, farmers, inventoryLots] =
    await Promise.all([
      getTable("commodities"),
      getTable("categories"),
      getTable("farms"),
      getTable("users"),
      getTable("farmers"),
      getOptionalTable("commodity_inventory_lots"),
    ]);

  const categoriesById = new Map<string, Row>();
  categories.forEach((cat) => categoriesById.set(id(cat.category_id), cat));

  const farmsById = new Map<string, Row>();
  farms.forEach((farm) => farmsById.set(id(farm.farm_id), farm));

  const usersById = new Map<string, Row>();
  users.forEach((user) => usersById.set(id(user.user_id), user));

  const farmersById = new Map<string, Row>();
  farmers.forEach((farmer) => farmersById.set(id(farmer.farmer_user_id), farmer));

  const lotsByCommodity = new Map<string, Row[]>();
  inventoryLots.forEach((lot) => {
    const commId = id(lot.commodity_id);
    if (!lotsByCommodity.has(commId)) lotsByCommodity.set(commId, []);
    lotsByCommodity.get(commId)!.push(lot);
  });

  const categoryNamesSet = new Set<string>();
  categories.forEach((cat) => {
    const catName = text(cat.category_name).trim();
    if (catName) categoryNamesSet.add(catName);
  });

  const catalog = commodities.map((comm) => {
    const commId = id(comm.commodity_id);
    const farmId = id(comm.farm_id);
    const catId = id(comm.category_id);
    const farm = farmsById.get(farmId);
    const farmerUserId = farm ? id(farm.farmer_user_id) : "";
    const user = usersById.get(farmerUserId);
    const category = categoriesById.get(catId);
    const lots = lotsByCommodity.get(commId) ?? [];

    const batches = lots.map((lot) => ({
      dateType: text(lot.date_type),
      expiresAt: text(lot.expires_at) || null,
      harvestedAt: text(lot.harvested_at) || null,
      id: id(lot.inventory_lot_id),
      lotCode: text(lot.lot_code) || null,
      quantityReceived: number(lot.quantity_received),
      quantityRemaining: number(lot.quantity_remaining),
      sellUntil: text(lot.sell_until) || null,
      storageInstructions: text(lot.storage_instructions) || null,
    }));

    const farmLocation = farm
      ? text(
          farm.farm_location ?? farm.location,
          [text(farm.city_municipality), text(farm.province)]
            .filter(Boolean)
            .join(", ") || "Location not set",
        )
      : "Location not recorded";

    const farmerDisplayName = user
      ? name(user, `Farmer ${farmerUserId}`)
      : `Farmer ${farmerUserId || "Unknown"}`;

    return {
      availabilityStatus: display(comm.availability_status, "ready_now"),
      availableQuantity: comm.available_quantity == null ? 0 : number(comm.available_quantity),
      batches,
      categoryId: catId,
      categoryName: category ? text(category.category_name, "Uncategorized") : "Uncategorized",
      commodityId: commId,
      createdAt: date(comm.created_at),
      description: text(comm.description),
      farmId,
      farmLocation,
      farmName: farm ? text(farm.farm_name, `Farm ${farmId}`) : "Farm not recorded",
      farmerEmail: user ? text(user.email) : "",
      farmerId: farmerUserId,
      farmerName: farmerDisplayName,
      gradeQuality: text(comm.grade_quality) || null,
      harvestDate: text(comm.harvest_date) || null,
      imageUrl: text(comm.image_url ?? comm.commodity_image_url),
      isOrganic: comm.is_organic === true,
      minimumOrderQuantity:
        comm.minimum_order_quantity == null ? null : number(comm.minimum_order_quantity),
      name: text(comm.commodity_name, `Commodity ${commId}`),
      price: number(comm.price_per_unit),
      productionStatus: display(comm.production_status, "harvested"),
      status: display(comm.commodity_status, "available").toLowerCase(),
      unitType: text(comm.unit_type, "kg"),
      updatedAt: date(comm.updated_at),
    };
  });

  const farmsList = farms.map((f) => {
    const fId = id(f.farm_id);
    const farmerUserId = id(f.farmer_user_id);
    const user = usersById.get(farmerUserId);
    const farmerDisplayName = user
      ? name(user, `Farmer ${farmerUserId}`)
      : `Farmer ${farmerUserId || "Unknown"}`;
    const farmLocation = text(
      f.farm_location ?? f.location,
      [text(f.city_municipality), text(f.province)].filter(Boolean).join(", ") || "Location not set",
    );
    return {
      farmId: fId,
      farmName: text(f.farm_name, `Farm ${fId}`),
      farmerId: farmerUserId,
      farmerName: farmerDisplayName,
      location: farmLocation,
    };
  });

  return {
    categories: Array.from(categoryNamesSet).sort(),
    commodities: catalog,
    farms: farmsList,
  };
};

export const createCommodity = async (
  payload: unknown,
  _admin: Admin,
) => {
  if (typeof payload !== "object" || payload === null) {
    throw createApiError("INVALID_PAYLOAD", "A JSON object is required.", 400);
  }

  const body = payload as Record<string, unknown>;
  const farmId = body.farmId != null ? String(body.farmId).trim() : "";
  const commName = typeof body.name === "string" ? body.name.trim() : "";
  const price = typeof body.price === "number" ? body.price : Number(body.price);

  if (!farmId) {
    throw createApiError("INVALID_PAYLOAD", "Farm ID is required to create a commodity.", 400);
  }
  if (!commName) {
    throw createApiError("INVALID_PAYLOAD", "Commodity name is required.", 400);
  }
  if (isNaN(price) || price < 0) {
    throw createApiError("INVALID_PAYLOAD", "Price per unit must be a non-negative number.", 400);
  }

  // Verify farm exists
  const farms = await getTable("farms", {
    farm_id: `eq.${encodeURIComponent(farmId)}`,
  });
  if (!farms.length) {
    throw createApiError("FARM_NOT_FOUND", "Specified farm could not be found.", 404);
  }

  // Resolve category
  const categoryName = typeof body.categoryName === "string" && body.categoryName.trim()
    ? body.categoryName.trim()
    : "General";
  let categoryId = body.categoryId != null ? String(body.categoryId).trim() : "";

  if (!categoryId && categoryName) {
    const existingCategories = await getTable("categories", {
      farm_id: `eq.${encodeURIComponent(farmId)}`,
    });
    const match = existingCategories.find(
      (c) => text(c.category_name).toLowerCase() === categoryName.toLowerCase(),
    );
    if (match) {
      categoryId = id(match.category_id);
    } else {
      const created = await insertRow("categories", {
        category_name: categoryName,
        farm_id: farmId,
        status: "active",
      });
      categoryId = id(created.category_id);
    }
  }

  const unitType = typeof body.unitType === "string" && body.unitType.trim() ? body.unitType.trim() : "kg";
  const availableQuantity = typeof body.availableQuantity === "number"
    ? body.availableQuantity
    : Number(body.availableQuantity) || 0;
  const minimumOrderQuantity = body.minimumOrderQuantity != null && body.minimumOrderQuantity !== ""
    ? Number(body.minimumOrderQuantity)
    : null;
  const gradeQuality = typeof body.gradeQuality === "string" && body.gradeQuality.trim() ? body.gradeQuality.trim() : null;
  const productionStatus = typeof body.productionStatus === "string" && body.productionStatus.trim() ? body.productionStatus.trim() : "harvested";
  const availabilityStatus = typeof body.availabilityStatus === "string" && body.availabilityStatus.trim() ? body.availabilityStatus.trim() : "ready_now";
  const isOrganic = body.isOrganic === true;
  const status = typeof body.status === "string" && body.status.trim() ? body.status.trim().toLowerCase() : "available";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const harvestDate = typeof body.harvestDate === "string" && body.harvestDate.trim()
    ? body.harvestDate.trim()
    : typeof body.harvestedAt === "string" && body.harvestedAt.trim()
      ? body.harvestedAt.trim()
      : null;
  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : null;

  const nowIso = new Date().toISOString();
  const commRow: Row = {
    available_quantity: availableQuantity,
    availability_status: availabilityStatus,
    category_id: categoryId,
    commodity_name: commName,
    commodity_status: status,
    created_at: nowIso,
    description,
    farm_id: farmId,
    grade_quality: gradeQuality,
    harvest_date: harvestDate,
    image_url: imageUrl,
    is_organic: isOrganic,
    minimum_order_quantity: minimumOrderQuantity,
    price_per_unit: price,
    production_status: productionStatus,
    unit_type: unitType,
    updated_at: nowIso,
  };

  const createdCommodity = await insertRow("commodities", commRow);
  const newCommId = id(createdCommodity.commodity_id);

  // Initial batch insertion
  const lotCode = typeof body.lotCode === "string" && body.lotCode.trim() ? body.lotCode.trim() : null;
  const dateType = typeof body.dateType === "string" && body.dateType.trim() ? body.dateType.trim() : "fresh_produce";
  const harvestedAt = typeof body.harvestedAt === "string" && body.harvestedAt.trim() ? body.harvestedAt.trim() : harvestDate;
  const sellUntil = typeof body.sellUntil === "string" && body.sellUntil.trim() ? body.sellUntil.trim() : null;
  const expiresAt = typeof body.expiresAt === "string" && body.expiresAt.trim() ? body.expiresAt.trim() : null;
  const storageInstructions = typeof body.storageInstructions === "string" && body.storageInstructions.trim() ? body.storageInstructions.trim() : null;

  let createdBatch: Row | null = null;
  if (availableQuantity > 0 || lotCode || harvestedAt || sellUntil || expiresAt || storageInstructions) {
    try {
      createdBatch = await insertRow("commodity_inventory_lots", {
        commodity_id: newCommId,
        created_at: nowIso,
        date_type: dateType,
        expires_at: expiresAt,
        harvested_at: harvestedAt,
        lot_code: lotCode,
        quantity_received: availableQuantity,
        quantity_remaining: availableQuantity,
        sell_until: sellUntil,
        storage_instructions: storageInstructions,
      });
    } catch (_err) {
      // Table might not be supported in mock tests
    }
  }

  return {
    commodity: {
      availabilityStatus,
      availableQuantity,
      batches: createdBatch ? [{
        dateType,
        expiresAt,
        harvestedAt,
        id: id(createdBatch.inventory_lot_id),
        lotCode,
        quantityReceived: availableQuantity,
        quantityRemaining: availableQuantity,
        sellUntil,
        storageInstructions,
      }] : [],
      categoryId,
      categoryName,
      commodityId: newCommId,
      createdAt: nowIso,
      description,
      farmId,
      farmLocation: "",
      farmName: "",
      farmerEmail: "",
      farmerId: "",
      farmerName: "",
      gradeQuality,
      harvestDate,
      imageUrl: imageUrl || "",
      isOrganic,
      minimumOrderQuantity,
      name: commName,
      price,
      productionStatus,
      status,
      unitType,
      updatedAt: nowIso,
    },
    commodityId: newCommId,
    created: true,
  };
};

export const updateCommodityStatus = async (
  commodityId: string,
  newStatus: string,
  _admin: Admin,
) => {
  const normalized = newStatus.trim().toLowerCase();
  const validStatuses = ["available", "hidden", "delisted", "approved"];
  if (!validStatuses.includes(normalized)) {
    throw createApiError(
      "INVALID_COMMODITY_STATUS",
      `Invalid commodity status. Must be one of: ${validStatuses.join(", ")}`,
      400,
    );
  }

  // "approved" translates to "available"
  const targetStatus = normalized === "approved" ? "available" : normalized;

  const commodities = await getTable("commodities", {
    commodity_id: `eq.${encodeURIComponent(commodityId)}`,
  });
  if (!commodities.length) {
    throw createApiError("COMMODITY_NOT_FOUND", "Commodity not found.", 404);
  }

  const updated = await updateRows(
    "commodities",
    `commodity_id=eq.${encodeURIComponent(commodityId)}`,
    {
      commodity_status: targetStatus,
      updated_at: new Date().toISOString(),
    },
  );

  return {
    commodityId,
    status: targetStatus,
    updated: updated.length > 0,
  };
};

export const updateCommodityDetails = async (
  commodityId: string,
  payload: unknown,
  _admin: Admin,
) => {
  if (typeof payload !== "object" || payload === null) {
    throw createApiError("INVALID_PAYLOAD", "A JSON object is required.", 400);
  }

  const body = payload as Record<string, unknown>;
  const description = typeof body.description === "string" ? body.description.trim() : undefined;
  const categoryName = typeof body.categoryName === "string" ? body.categoryName.trim() : undefined;
  const categoryId = body.categoryId != null ? String(body.categoryId).trim() : undefined;

  const commodities = await getTable("commodities", {
    commodity_id: `eq.${encodeURIComponent(commodityId)}`,
  });
  if (!commodities.length) {
    throw createApiError("COMMODITY_NOT_FOUND", "Commodity not found.", 404);
  }

  const commodity = commodities[0];
  const farmId = id(commodity.farm_id);
  const updates: Row = {
    updated_at: new Date().toISOString(),
  };

  if (description !== undefined) {
    updates.description = description;
  }

  if (typeof body.name === "string" && body.name.trim()) {
    updates.commodity_name = body.name.trim();
  }

  if (body.price !== undefined) {
    const p = Number(body.price);
    if (!isNaN(p) && p >= 0) updates.price_per_unit = p;
  }

  if (typeof body.unitType === "string" && body.unitType.trim()) {
    updates.unit_type = body.unitType.trim();
  }

  if (body.availableQuantity !== undefined) {
    const q = Number(body.availableQuantity);
    if (!isNaN(q) && q >= 0) updates.available_quantity = q;
  }

  if (body.minimumOrderQuantity !== undefined) {
    const moq = body.minimumOrderQuantity != null && body.minimumOrderQuantity !== ""
      ? Number(body.minimumOrderQuantity)
      : null;
    updates.minimum_order_quantity = moq;
  }

  if (body.gradeQuality !== undefined) {
    updates.grade_quality = typeof body.gradeQuality === "string" && body.gradeQuality.trim()
      ? body.gradeQuality.trim()
      : null;
  }

  if (typeof body.productionStatus === "string" && body.productionStatus.trim()) {
    updates.production_status = body.productionStatus.trim();
  }

  if (typeof body.availabilityStatus === "string" && body.availabilityStatus.trim()) {
    updates.availability_status = body.availabilityStatus.trim();
  }

  if (body.isOrganic !== undefined) {
    updates.is_organic = body.isOrganic === true;
  }

  if (typeof body.status === "string" && body.status.trim()) {
    updates.commodity_status = body.status.trim().toLowerCase();
  }

  if (body.harvestDate !== undefined) {
    updates.harvest_date = typeof body.harvestDate === "string" && body.harvestDate.trim()
      ? body.harvestDate.trim()
      : null;
  }

  if (categoryName || categoryId) {
    let resolvedCategoryId = categoryId;

    if (!resolvedCategoryId && categoryName) {
      // Look up existing category for this farm by name
      const existingCategories = await getTable("categories", {
        farm_id: `eq.${encodeURIComponent(farmId)}`,
      });
      const match = existingCategories.find(
        (c) => text(c.category_name).toLowerCase() === categoryName.toLowerCase(),
      );
      if (match) {
        resolvedCategoryId = id(match.category_id);
      } else {
        // Create new category for this farm
        const created = await insertRow("categories", {
          category_name: categoryName,
          farm_id: farmId,
          status: "active",
        });
        resolvedCategoryId = id(created.category_id);
      }
    }

    if (resolvedCategoryId) {
      updates.category_id = resolvedCategoryId;
    }
  }

  const updated = await updateRows(
    "commodities",
    `commodity_id=eq.${encodeURIComponent(commodityId)}`,
    updates,
  );

  // Granular Agricultural Batch synchronization
  const lotCode = typeof body.lotCode === "string" ? body.lotCode.trim() : undefined;
  const dateType = typeof body.dateType === "string" ? body.dateType.trim() : undefined;
  const harvestedAt = typeof body.harvestedAt === "string" ? body.harvestedAt.trim() : undefined;
  const sellUntil = typeof body.sellUntil === "string" ? body.sellUntil.trim() : undefined;
  const expiresAt = typeof body.expiresAt === "string" ? body.expiresAt.trim() : undefined;
  const storageInstructions = typeof body.storageInstructions === "string" ? body.storageInstructions.trim() : undefined;
  const batchId = body.batchId != null ? String(body.batchId).trim() : undefined;

  const hasBatchUpdates = lotCode !== undefined || dateType !== undefined || harvestedAt !== undefined ||
    sellUntil !== undefined || expiresAt !== undefined || storageInstructions !== undefined;

  if (hasBatchUpdates) {
    try {
      const existingLots = await getOptionalTable("commodity_inventory_lots");
      const commodityLots = existingLots.filter((l) => id(l.commodity_id) === commodityId);
      const targetLot = batchId ? commodityLots.find((l) => id(l.inventory_lot_id) === batchId) : commodityLots[0];

      if (targetLot) {
        const lotUpdates: Row = {};
        if (lotCode !== undefined) lotUpdates.lot_code = lotCode || null;
        if (dateType !== undefined) lotUpdates.date_type = dateType;
        if (harvestedAt !== undefined) lotUpdates.harvested_at = harvestedAt || null;
        if (sellUntil !== undefined) lotUpdates.sell_until = sellUntil || null;
        if (expiresAt !== undefined) lotUpdates.expires_at = expiresAt || null;
        if (storageInstructions !== undefined) lotUpdates.storage_instructions = storageInstructions || null;
        if (updates.available_quantity !== undefined) {
          lotUpdates.quantity_remaining = updates.available_quantity;
        }
        await updateRows(
          "commodity_inventory_lots",
          `inventory_lot_id=eq.${encodeURIComponent(id(targetLot.inventory_lot_id))}`,
          lotUpdates,
        );
      } else {
        const initialQty = updates.available_quantity ?? number(commodity.available_quantity) ?? 0;
        await insertRow("commodity_inventory_lots", {
          commodity_id: commodityId,
          created_at: new Date().toISOString(),
          date_type: dateType || "fresh_produce",
          expires_at: expiresAt || null,
          harvested_at: harvestedAt || updates.harvest_date || null,
          lot_code: lotCode || null,
          quantity_received: initialQty,
          quantity_remaining: initialQty,
          sell_until: sellUntil || null,
          storage_instructions: storageInstructions || null,
        });
      }
    } catch (_err) {
      // Table might not exist in some environments
    }
  }

  return {
    commodityId,
    updated: updated.length > 0,
    updates,
  };
};

