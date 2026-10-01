import { getTable, insertRow, updateRows } from "../repository.ts";
import type { Row } from "../types.ts";
import { createApiError, id, number, text } from "../value.ts";

export const listCategories = async () => {
  const [categories, farms, commodities] = await Promise.all([
    getTable("categories"),
    getTable("farms"),
    getTable("commodities"),
  ]);

  const farmsById = new Map<string, Row>();
  farms.forEach((farm) => farmsById.set(id(farm.farm_id), farm));

  const commodityCountsByCat = new Map<string, number>();
  commodities.forEach((comm) => {
    const catId = id(comm.category_id);
    commodityCountsByCat.set(catId, (commodityCountsByCat.get(catId) || 0) + 1);
  });

  const formatted = categories.map((cat) => {
    const catId = id(cat.category_id);
    const farmId = id(cat.farm_id);
    const farm = farmsById.get(farmId);
    const status = text(cat.status, "active").trim().toLowerCase();
    const displayOrder = number(cat.display_order, 0);

    return {
      categoryId: catId,
      id: catId,
      categoryName: text(cat.category_name, `Category ${catId}`),
      description: text(cat.description, ""),
      status: status === "delisted" ? "delisted" : "active",
      farmId,
      farmName: farm ? text(farm.farm_name, `Farm ${farmId}`) : `Farm ${farmId}`,
      commodityCount: commodityCountsByCat.get(catId) || 0,
      displayOrder,
      createdAt: text(cat.created_at, ""),
    };
  });

  formatted.sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) {
      return a.displayOrder - b.displayOrder;
    }
    return a.categoryName.localeCompare(b.categoryName);
  });

  return {
    categories: formatted,
    totalCount: formatted.length,
    activeCount: formatted.filter((c) => c.status === "active").length,
    delistedCount: formatted.filter((c) => c.status === "delisted").length,
  };
};

export const createCategory = async (payload: Record<string, unknown>) => {
  const categoryName = typeof payload.categoryName === "string" ? payload.categoryName.trim() : "";
  if (!categoryName) {
    throw createApiError("CATEGORY_NAME_REQUIRED", "Category name is required.", 400);
  }

  let farmId = payload.farmId != null ? String(payload.farmId).trim() : "";
  if (!farmId) {
    const farms = await getTable("farms");
    farmId = farms.length > 0 ? id(farms[0].farm_id) : "1";
  }

  const rawStatus = typeof payload.status === "string" ? payload.status.trim().toLowerCase() : "active";
  const status = rawStatus === "delisted" ? "delisted" : "active";
  const description = typeof payload.description === "string" ? payload.description.trim() : "";

  let displayOrder = Number(payload.displayOrder);
  if (Number.isNaN(displayOrder)) {
    const existing = await getTable("categories");
    const maxOrder = existing.reduce((max, cat) => {
      const order = number(cat.display_order, 0);
      return order > max ? order : max;
    }, 0);
    displayOrder = maxOrder + 1;
  }

  const row: Record<string, unknown> = {
    category_name: categoryName,
    description,
    farm_id: farmId,
    status,
    display_order: displayOrder,
  };

  let created: Row;
  try {
    created = await insertRow("categories", row);
  } catch (_error) {
    delete row.display_order;
    created = await insertRow("categories", row);
  }

  return {
    categoryId: id(created.category_id),
    id: id(created.category_id),
    categoryName: text(created.category_name, categoryName),
    description: text(created.description, description),
    status: text(created.status, status),
    farmId: id(created.farm_id),
    displayOrder: number(created.display_order, displayOrder),
    createdAt: text(created.created_at, new Date().toISOString()),
  };
};

export const updateCategory = async (categoryId: string, payload: Record<string, unknown>) => {
  const existing = await getTable("categories", {
    category_id: `eq.${encodeURIComponent(categoryId)}`,
  });

  if (!existing.length) {
    throw createApiError("CATEGORY_NOT_FOUND", "Category not found.", 404);
  }

  const updates: Record<string, unknown> = {};
  if (typeof payload.categoryName === "string") {
    const nameStr = payload.categoryName.trim();
    if (!nameStr) {
      throw createApiError("CATEGORY_NAME_REQUIRED", "Category name cannot be empty.", 400);
    }
    updates.category_name = nameStr;
  }

  if (payload.description !== undefined) {
    updates.description = typeof payload.description === "string" ? payload.description.trim() : "";
  }

  if (payload.status !== undefined) {
    const rawStatus = String(payload.status).trim().toLowerCase();
    const valid = ["active", "delisted", "hidden", "inactive"];
    if (!valid.includes(rawStatus)) {
      throw createApiError(
        "INVALID_CATEGORY_STATUS",
        `Invalid category status. Must be one of: ${valid.join(", ")}`,
        400,
      );
    }
    updates.status = rawStatus;
  }

  if (payload.displayOrder !== undefined && !Number.isNaN(Number(payload.displayOrder))) {
    updates.display_order = Number(payload.displayOrder);
  }

  if (payload.farmId !== undefined && payload.farmId != null) {
    updates.farm_id = String(payload.farmId).trim();
  }

  if (Object.keys(updates).length === 0) {
    return {
      categoryId,
      id: categoryId,
      updated: false,
    };
  }

  let updated: Row[];
  try {
    updated = await updateRows(
      "categories",
      `category_id=eq.${encodeURIComponent(categoryId)}`,
      updates,
    );
  } catch (_error) {
    if (updates.display_order !== undefined) {
      delete updates.display_order;
      updated = await updateRows(
        "categories",
        `category_id=eq.${encodeURIComponent(categoryId)}`,
        updates,
      );
    } else {
      throw _error;
    }
  }

  const result = updated[0] || existing[0];
  return {
    categoryId,
    id: categoryId,
    categoryName: text(result.category_name, ""),
    description: text(result.description, ""),
    status: text(result.status, "active"),
    farmId: id(result.farm_id),
    displayOrder: number(result.display_order, 0),
    updated: true,
  };
};

export const reorderCategories = async (orderedIds: string[]) => {
  const updates = orderedIds.map((catId, index) =>
    updateRows(
      "categories",
      `category_id=eq.${encodeURIComponent(catId.trim())}`,
      { display_order: index + 1 },
    ).catch(() => []),
  );

  await Promise.all(updates);

  return {
    orderedIds,
    updated: true,
  };
};
