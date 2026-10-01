const {
  getSupabaseRows,
  insertSupabaseRow,
  updateSupabaseRows,
} = require('./supabaseService');

class AdminCategoryError extends Error {
  constructor(message, statusCode = 400, code = 'CATEGORY_ERROR') {
    super(message);
    this.name = 'AdminCategoryError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const listCategories = async () => {
  const [categories, farms, commodities] = await Promise.all([
    getSupabaseRows('categories').catch(() => []),
    getSupabaseRows('farms').catch(() => []),
    getSupabaseRows('commodities').catch(() => []),
  ]);

  const farmsById = new Map();
  farms.forEach((farm) => farmsById.set(String(farm.farm_id), farm));

  const commodityCountsByCat = new Map();
  commodities.forEach((comm) => {
    const catId = String(comm.category_id);
    commodityCountsByCat.set(catId, (commodityCountsByCat.get(catId) || 0) + 1);
  });

  const formatted = categories.map((cat) => {
    const catId = String(cat.category_id);
    const farmId = String(cat.farm_id);
    const farm = farmsById.get(farmId);
    const status = (cat.status || 'active').trim().toLowerCase();
    const displayOrder = Number(cat.display_order) || 0;

    return {
      categoryId: catId,
      id: catId,
      categoryName: (cat.category_name || '').trim() || `Category ${catId}`,
      description: (cat.description || '').trim(),
      status: status === 'delisted' ? 'delisted' : 'active',
      farmId,
      farmName: farm?.farm_name || `Farm ${farmId}`,
      commodityCount: commodityCountsByCat.get(catId) || 0,
      displayOrder,
      createdAt: cat.created_at || '',
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
    activeCount: formatted.filter((c) => c.status === 'active').length,
    delistedCount: formatted.filter((c) => c.status === 'delisted').length,
  };
};

const createCategory = async (payload) => {
  if (typeof payload !== 'object' || payload === null) {
    throw new AdminCategoryError('A valid JSON object is required.', 400, 'INVALID_PAYLOAD');
  }

  const categoryName = typeof payload.categoryName === 'string' ? payload.categoryName.trim() : '';
  if (!categoryName) {
    throw new AdminCategoryError('Category name is required.', 400, 'CATEGORY_NAME_REQUIRED');
  }

  let farmId = payload.farmId != null ? String(payload.farmId).trim() : '';
  if (!farmId) {
    const farms = await getSupabaseRows('farms').catch(() => []);
    if (farms.length > 0) {
      farmId = String(farms[0].farm_id);
    } else {
      farmId = '1';
    }
  }

  const rawStatus = typeof payload.status === 'string' ? payload.status.trim().toLowerCase() : 'active';
  const status = rawStatus === 'delisted' ? 'delisted' : 'active';
  const description = typeof payload.description === 'string' ? payload.description.trim() : '';

  let displayOrder = Number(payload.displayOrder);
  if (Number.isNaN(displayOrder)) {
    const existing = await getSupabaseRows('categories').catch(() => []);
    const maxOrder = existing.reduce((max, cat) => {
      const order = Number(cat.display_order) || 0;
      return order > max ? order : max;
    }, 0);
    displayOrder = maxOrder + 1;
  }

  const row = {
    category_name: categoryName,
    description,
    farm_id: farmId,
    status,
    display_order: displayOrder,
  };

  let created;
  try {
    created = await insertSupabaseRow('categories', row);
  } catch (error) {
    // Fallback if display_order is not supported in the database yet
    delete row.display_order;
    created = await insertSupabaseRow('categories', row);
  }

  return {
    categoryId: String(created.category_id),
    id: String(created.category_id),
    categoryName: created.category_name,
    description: created.description || '',
    status: created.status || 'active',
    farmId: String(created.farm_id),
    displayOrder: Number(created.display_order) || displayOrder,
    createdAt: created.created_at || new Date().toISOString(),
  };
};

const updateCategory = async (categoryId, payload) => {
  if (typeof payload !== 'object' || payload === null) {
    throw new AdminCategoryError('A valid JSON object is required.', 400, 'INVALID_PAYLOAD');
  }

  const idStr = String(categoryId).trim();
  const existing = await getSupabaseRows('categories', {
    category_id: `eq.${encodeURIComponent(idStr)}`,
  });

  if (!existing.length) {
    throw new AdminCategoryError('Category not found.', 404, 'CATEGORY_NOT_FOUND');
  }

  const updates = {};
  if (typeof payload.categoryName === 'string') {
    const name = payload.categoryName.trim();
    if (!name) {
      throw new AdminCategoryError('Category name cannot be empty.', 400, 'CATEGORY_NAME_REQUIRED');
    }
    updates.category_name = name;
  }

  if (payload.description !== undefined) {
    updates.description = typeof payload.description === 'string' ? payload.description.trim() : '';
  }

  if (payload.status !== undefined) {
    const rawStatus = String(payload.status).trim().toLowerCase();
    const valid = ['active', 'delisted', 'hidden', 'inactive'];
    if (!valid.includes(rawStatus)) {
      throw new AdminCategoryError(
        `Invalid category status. Must be one of: ${valid.join(', ')}`,
        400,
        'INVALID_CATEGORY_STATUS',
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
      categoryId: idStr,
      id: idStr,
      updated: false,
    };
  }

  let updated;
  try {
    updated = await updateSupabaseRows(
      'categories',
      { category_id: `eq.${encodeURIComponent(idStr)}` },
      updates,
    );
  } catch (error) {
    if (updates.display_order !== undefined) {
      delete updates.display_order;
      updated = await updateSupabaseRows(
        'categories',
        { category_id: `eq.${encodeURIComponent(idStr)}` },
        updates,
      );
    } else {
      throw error;
    }
  }

  const result = updated[0] || existing[0];
  return {
    categoryId: idStr,
    id: idStr,
    categoryName: result.category_name,
    description: result.description || '',
    status: result.status || 'active',
    farmId: String(result.farm_id),
    displayOrder: Number(result.display_order) || 0,
    updated: true,
  };
};

const setCategoryStatus = async (categoryId, newStatus) => {
  const normalized = (newStatus || '').trim().toLowerCase();
  const valid = ['active', 'delisted', 'hidden', 'inactive'];
  if (!valid.includes(normalized)) {
    throw new AdminCategoryError(
      `Invalid category status. Must be one of: ${valid.join(', ')}`,
      400,
      'INVALID_CATEGORY_STATUS',
    );
  }

  return updateCategory(categoryId, { status: normalized });
};

const reorderCategories = async (orderedIds) => {
  if (!Array.isArray(orderedIds)) {
    throw new AdminCategoryError('orderedIds must be an array of category IDs.', 400, 'INVALID_REORDER_PAYLOAD');
  }

  const updates = orderedIds.map((id, index) =>
    updateSupabaseRows(
      'categories',
      { category_id: `eq.${encodeURIComponent(String(id).trim())}` },
      { display_order: index + 1 },
    ).catch(() => []),
  );

  await Promise.all(updates);

  return {
    orderedIds,
    updated: true,
  };
};

module.exports = {
  AdminCategoryError,
  createCategory,
  listCategories,
  reorderCategories,
  setCategoryStatus,
  updateCategory,
};
