const { getSupabaseRows, updateSupabaseRows } = require('./supabaseService');

const PHP_FORMATTER = new Intl.NumberFormat('en-PH', {
  currency: 'PHP',
  style: 'currency',
});

const DATE_FORMATTER = new Intl.DateTimeFormat('en-PH', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const COMMODITY_COLORS = ['#71a972', '#f0b678', '#8db7d6', '#9f8bc5', '#d9dfda'];
const DELIVERY_STATUSES = [
  { color: '#71a972', dotClass: 'dot-green', label: 'Delivered' },
  { color: '#f0b678', dotClass: 'dot-orange', label: 'In transit' },
  { color: '#d9dfda', dotClass: 'dot-gray', label: 'Awaiting pickup' },
];

const isRecord = (value) =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asRows = (value) => value.filter(isRecord);

const getText = (value, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback;

const getNumber = (value, fallback = 0) => {
  const parsed = typeof value === 'number' ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : fallback;
};

const getTextArray = (value) =>
  Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];

const getId = (value) => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }

  return '';
};

const createIndex = (rows, field) =>
  rows.reduce((index, row) => {
    const id = getId(row[field]);

    if (id) index.set(id, row);

    return index;
  }, new Map());

const groupRows = (rows, field) =>
  rows.reduce((groups, row) => {
    const id = getId(row[field]);

    if (!id) return groups;

    groups.set(id, [...(groups.get(id) ?? []), row]);
    return groups;
  }, new Map());

const toDisplayText = (value, fallback = 'Not set') => {
  const text = getText(value);

  if (!text) return fallback;

  return text
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

const getName = (row, fallback) => {
  const parts = [
    getText(row.first_name),
    getText(row.middle_name),
    getText(row.last_name),
    getText(row.extension_name ?? row.suffix),
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(' ') : fallback;
};

const getInitials = (name) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'AG';

const formatMoney = (value) => PHP_FORMATTER.format(getNumber(value));

const formatDate = (value) => {
  const date = new Date(getText(value));

  return Number.isNaN(date.getTime()) ? 'Not recorded' : DATE_FORMATTER.format(date);
};

const formatRelativeTime = (value) => {
  const date = new Date(getText(value));

  if (Number.isNaN(date.getTime())) return 'Not recorded';

  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));

  if (elapsedMinutes < 1) return 'Just now';
  if (elapsedMinutes < 60) return `${elapsedMinutes} min${elapsedMinutes === 1 ? '' : 's'} ago`;

  const elapsedHours = Math.floor(elapsedMinutes / 60);

  if (elapsedHours < 24) return `${elapsedHours} hr${elapsedHours === 1 ? '' : 's'} ago`;

  return formatDate(value);
};

const getTone = (status) => {
  const normalizedStatus = getText(status).toLowerCase();

  if (/(failed|cancelled|canceled|rejected|suspended|inactive|refund)/.test(normalizedStatus)) {
    return 'red';
  }

  if (/(pending|review|processing|transit|low|awaiting)/.test(normalizedStatus)) {
    return 'orange';
  }

  if (/(active|available|verified|completed|delivered|paid|success|published)/.test(normalizedStatus)) {
    return 'green';
  }

  return 'blue';
};

const toAccountStatus = (value) =>
  /(inactive|suspend|reject|cancel)/.test(getText(value).toLowerCase())
    ? 'Inactive'
    : 'Active';

const toPaymentStatus = (value) => {
  const normalizedStatus = getText(value).toLowerCase();

  if (/(complete|paid|success|settled)/.test(normalizedStatus)) return 'Completed';
  if (/(fail|cancel|refund|reject)/.test(normalizedStatus)) return 'Failed';

  return 'Pending';
};

const toOrderStatus = (order) =>
  toDisplayText(order.order_status ?? order.payment_status, 'Pending');

const isCompletedPayment = (payment) => payment.status === 'Completed';

const getPaymentAmount = (payment) => getNumber(payment.amountValue);

const getDateKey = (date) => date.toISOString().slice(0, 10);

const getSalesTrend = (payments) => {
  const days = Array.from({ length: 365 }, (_, index) => {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - (364 - index));
    return date;
  });
  const totals = new Map(
    days.map((day) => [getDateKey(day), { orders: new Set(), revenue: 0 }]),
  );

  payments.forEach((payment) => {
    if (!isCompletedPayment(payment)) return;

    const paidAt = new Date(getText(payment.paidAt));
    if (Number.isNaN(paidAt.getTime())) return;

    const day = totals.get(getDateKey(paidAt));
    if (!day) return;

    day.revenue += getPaymentAmount(payment);
    day.orders.add(payment.order);
  });

  return days.map((day) => {
    const total = totals.get(getDateKey(day));
    return {
      date: getDateKey(day),
      orders: total?.orders.size ?? 0,
      revenue: total?.revenue ?? 0,
    };
  });
};

const getDeliveryBucket = (status) => {
  const normalizedStatus = getText(status).toLowerCase();

  if (/(delivered|completed)/.test(normalizedStatus)) return 'Delivered';
  if (/(transit|delivery|picked|out_for)/.test(normalizedStatus)) return 'In transit';

  return 'Awaiting pickup';
};

const getMonthKey = (date) => `${date.getFullYear()}-${date.getMonth()}`;

const getPaymentActivityBars = (payments) => {
  const months = Array.from({ length: 12 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (11 - index));
    return date;
  });
  const totals = new Map(months.map((month) => [getMonthKey(month), 0]));

  payments.forEach((payment) => {
    const date = new Date(getText(payment.paidAt));
    const key = getMonthKey(date);

    if (!Number.isNaN(date.getTime()) && totals.has(key) && isCompletedPayment(payment)) {
      totals.set(key, (totals.get(key) ?? 0) + getPaymentAmount(payment));
    }
  });

  const values = months.map((month) => totals.get(getMonthKey(month)) ?? 0);
  const maximum = Math.max(...values, 0);

  return values.map((value) => (maximum === 0 ? 0 : Math.max(8, Math.round((value / maximum) * 100))));
};

const createFarmerFarms = ({ farms, commoditiesByFarm }) =>
  farms.map((farm) => {
    const farmId = getId(farm.farm_id);
    const farmImages = getTextArray(farm.farm_images).map((imageUrl, index) => ({
      alt: `Farm image ${index + 1}`,
      imageUrl,
      title: `Farm image ${index + 1}`,
    }));
    const coverImage = getText(farm.cover_image_url);

    if (coverImage && !farmImages.some((image) => image.imageUrl === coverImage)) {
      farmImages.unshift({
        alt: `${getText(farm.farm_name, 'Farm')} cover image`,
        imageUrl: coverImage,
        title: 'Farm cover image',
      });
    }

    return {
      certifications: getTextArray(farm.certifications),
      commodities: (commoditiesByFarm.get(farmId) ?? []).map((commodity) =>
        getText(commodity.commodity_name, 'Unnamed commodity'),
      ),
      farmImages,
      farmLocation: getText(
        farm.farm_location,
        [farm.city_municipality, farm.province].filter(Boolean).join(', ') || 'Location not set',
      ),
      farmName: getText(farm.farm_name, `Farm ${farmId || 'record'}`),
      farmSizeHectares: getNumber(farm.farm_size_hectares),
      farmingType: toDisplayText(farm.farming_type, 'Not specified'),
      farmerId: getId(farm.farmer_user_id),
      gpsLat: getNumber(farm.gps_lat),
      gpsLong: getNumber(farm.gps_long),
      id: farmId,
      irrigationType: toDisplayText(farm.irrigation_type, 'Not specified'),
      mainCrops: getTextArray(farm.main_crops),
      soilType: toDisplayText(farm.soil_type, 'Not specified'),
      status: toDisplayText(farm.status, 'Active'),
      tone: getTone(farm.status ?? 'active'),
      totalCrops: getNumber(farm.total_crops),
    };
  });

const createFarmerRows = ({ farmers, farmsByFarmer }) =>
  farmers.map((farmer) => {
    const farmerId = getId(farmer.farmer_user_id);
    const farms = farmsByFarmer.get(farmerId) ?? [];
    const firstFarm = farms[0];
    const status = toDisplayText(
      farmer.verification_status ?? farmer.account_status,
      'Pending',
    );

    return {
      category: firstFarm
        ? toDisplayText(firstFarm.farming_type, 'Farmer')
        : 'Farmer',
      entityId: farmerId,
      primary: getName(farmer, `Farmer ${farmerId || 'record'}`),
      secondary: `Farmer ID: ${farmerId || 'Not recorded'}`,
      status,
      tone: getTone(status),
      value: `${farms.length} farm${farms.length === 1 ? '' : 's'} registered`,
    };
  });

const createUserRows = ({ users, buyersByUser, adminsByUser }) =>
  users.map((user) => {
    const userId = getId(user.user_id);
    const buyer = buyersByUser.get(userId);
    const admin = adminsByUser.get(userId);
    const accountRole = getText(user.account_role).toLowerCase();
    const userType = admin ? 'Admin' : buyer ? 'Buyer' : accountRole === 'rider' ? 'Rider' : 'User';

    return {
      accountStatus: toAccountStatus(user.account_status),
      buyerUserId: buyer ? `BUY-${getId(buyer.buyer_user_id)}` : undefined,
      businessName: buyer ? getText(buyer.business_name) : undefined,
      contactNumber: getText(user.contact_number, 'Not provided'),
      createdAt: formatDate(user.created_at),
      dateOfBirth: formatDate(user.date_of_birth),
      eWalletDetails: user.e_wallet_details ? 'Wallet details on file' : 'Not linked',
      email: getText(user.email, 'Not provided'),
      extensionName: getText(user.extension_name),
      firstName: getText(user.first_name),
      gender: toDisplayText(user.gender, 'Not specified'),
      gpsLat: buyer ? getNumber(buyer.gps_lat) : undefined,
      gpsLong: buyer ? getNumber(buyer.gps_long) : undefined,
      lastName: getText(user.last_name),
      loyaltyPoints: buyer ? getNumber(buyer.loyalty_points) : undefined,
      middleName: getText(user.middle_name),
      preferredPaymentMethod: buyer
        ? toDisplayText(buyer.preferred_payment_method, 'Not set')
        : undefined,
      profilePhotoUrl: getText(user.profile_photo_url) || undefined,
      shippingAddress: buyer ? getText(buyer.shipping_address) : undefined,
      updatedAt: formatDate(user.updated_at),
      userId: `USR-${userId || 'record'}`,
      userType,
    };
  });

const createOrderRows = ({
  orders,
  cartItemsById,
  cartsById,
  buyersById,
  usersById,
  commoditiesById,
}) =>
  orders
    .map((order) => {
      const cartItem = cartItemsById.get(getId(order.cart_item_id));
      const cart = cartItem ? cartsById.get(getId(cartItem.cart_id)) : undefined;
      const buyer = cart ? buyersById.get(getId(cart.buyer_user_id)) : undefined;
      const user = buyer ? usersById.get(getId(buyer.user_id)) : undefined;
      const commodity = cartItem
        ? commoditiesById.get(getId(cartItem.commodity_id))
        : undefined;
      const customer = user ? getName(user, 'Customer') : 'Customer not recorded';
      const totalAmount = getNumber(
        order.total_amount,
        getNumber(cartItem?.quantity) * getNumber(cartItem?.price_at_time),
      );
      const status = toOrderStatus(order);

      return {
        customer,
        id: `AG-${getId(order.order_id) || 'record'}`,
        initial: getInitials(customer),
        item: commodity
          ? getText(commodity.commodity_name, 'Unnamed commodity')
          : 'Commodity not recorded',
        qty: `${getNumber(cartItem?.quantity)} ${getText(commodity?.unit_type, 'unit')}`,
        status,
        time: formatRelativeTime(order.order_date ?? order.created_at),
        tone: getTone(status),
        total: formatMoney(totalAmount),
      };
    })
    .sort((currentOrder, nextOrder) => {
      const currentId = Number(currentOrder.id.replace(/\D/g, ''));
      const nextId = Number(nextOrder.id.replace(/\D/g, ''));
      return nextId - currentId;
    });

const createPaymentRows = ({ payments, ordersById, orderRowsById }) =>
  payments
    .map((payment) => {
      const orderId = getId(payment.order_id);
      const order = ordersById.get(orderId);
      const orderRow = orderRowsById.get(orderId);
      const amountValue = getNumber(payment.amount);
      const netValue = getNumber(payment.amount_received, amountValue);
      const status = toPaymentStatus(payment.collection_status ?? payment.payment_status);

      return {
        amount: formatMoney(amountValue),
        amountValue,
        customer: orderRow?.customer ?? 'Customer not recorded',
        fee: payment.amount_received === null || payment.amount_received === undefined
          ? 'Not recorded'
          : formatMoney(Math.max(0, amountValue - netValue)),
        id: `PY-${getId(payment.payment_id) || 'record'}`,
        method: toDisplayText(payment.payment_method ?? order?.payment_method, 'Not set'),
        net: formatMoney(netValue),
        order: `Order #AG-${orderId || 'record'}`,
        paidAt: getText(payment.payment_date ?? payment.recorded_at ?? payment.created_at),
        settlement: toDisplayText(payment.collection_status, status === 'Completed' ? 'Ready' : 'Confirming'),
        status,
        time: formatRelativeTime(payment.payment_date ?? payment.recorded_at ?? payment.created_at),
        tone: getTone(status),
      };
    })
    .sort((currentPayment, nextPayment) =>
      nextPayment.paidAt.localeCompare(currentPayment.paidAt),
    );

const createEntityRows = ({
  admins,
  adminRoles,
  buyers,
  usersById,
  farmers,
  farmerRows,
  farms,
  farmerFarms,
  categories,
  commodities,
  carts,
  cartItems,
  orders,
  orderItems,
  payments,
  reviews,
  riderRatings,
  deliveries,
  logisticsCompanies,
  riders,
  users,
}) => {
  const farmsById = createIndex(farms, 'farm_id');
  const categoriesById = createIndex(categories, 'category_id');
  const logisticsCompaniesById = createIndex(
    logisticsCompanies,
    'logistics_company_id',
  );
  const ordersById = createIndex(orders, 'order_id');
  const buyersById = createIndex(buyers, 'buyer_user_id');
  const farmersById = createIndex(farmers, 'farmer_user_id');
  const farmersByAuthId = createIndex(farmers, 'auth_user_id');
  const ridersById = createIndex(riders, 'rider_id');
  const deliveriesById = createIndex(deliveries, 'delivery_id');
  const cartsById = createIndex(carts, 'cart_id');
  const cartItemsById = createIndex(cartItems, 'cart_item_id');

  const getBuyerName = (buyerId, fallback = 'Buyer') => {
    const buyer = buyersById.get(getId(buyerId));
    const user = buyer ? usersById.get(getId(buyer.user_id)) : undefined;

    return user ? getName(user, fallback) : fallback;
  };

  const getOrderBuyerName = (orderId, fallback = 'Buyer') => {
    const order = ordersById.get(getId(orderId));
    const cartItem = order ? cartItemsById.get(getId(order.cart_item_id)) : undefined;
    const cart = cartItem ? cartsById.get(getId(cartItem.cart_id)) : undefined;

    return cart ? getBuyerName(cart.buyer_user_id, fallback) : fallback;
  };

  const reviewRows = [
    ...reviews.map((review) => {
      const farmerId = getId(review.farmer_user_id);
      const farmer = farmersById.get(farmerId);
      const rating = getNumber(review.rating);

      return {
        category: 'Farmer review',
        comment: getText(review.comment, 'No written review'),
        entityId: getId(review.review_id),
        primary: getBuyerName(review.buyer_user_id, 'Buyer'),
        rating,
        referenceLabel: `Order #AG-${getId(review.order_id) || 'record'}`,
        reviewDate: getText(review.created_at),
        reviewedName: farmer
          ? getName(farmer, `Farmer ${farmerId || 'record'}`)
          : `Farmer ${farmerId || 'not recorded'}`,
        reviewedType: 'Farmer',
        secondary: getText(review.comment, 'No written review'),
        status: 'Published',
        tone: 'green',
        value: `${rating} / 5 rating`,
      };
    }),
    ...riderRatings.map((review) => {
      const deliveryId = getId(review.delivery_id);
      const delivery = deliveriesById.get(deliveryId);
      const orderId = getId(delivery?.order_id);
      const riderId = getId(review.rider_id);
      const rider = ridersById.get(riderId);
      const reviewerRole = getText(review.reviewer_role, 'Reviewer');
      const reviewerFarmer = farmersByAuthId.get(getId(review.reviewer_auth_id));
      const reviewerName = reviewerRole.toLowerCase() === 'farmer' && reviewerFarmer
        ? getName(reviewerFarmer, 'Farmer')
        : getOrderBuyerName(orderId, toDisplayText(reviewerRole, 'Reviewer'));
      const rating = getNumber(review.rating);

      return {
        category: 'Rider review',
        comment: getText(review.comment, 'No written review'),
        entityId: getId(review.rating_id),
        primary: reviewerName,
        rating,
        referenceLabel: orderId
          ? `Delivery ${deliveryId || 'record'} · Order #AG-${orderId}`
          : `Delivery ${deliveryId || 'record'}`,
        reviewDate: getText(review.created_at),
        reviewedName: rider
          ? getText(rider.full_name, getName(rider, `Rider ${riderId || 'record'}`))
          : `Rider ${riderId || 'not recorded'}`,
        reviewedType: 'Rider',
        secondary: getText(review.comment, 'No written review'),
        status: 'Published',
        tone: 'green',
        value: `${rating} / 5 rating`,
      };
    }),
  ].sort((current, next) => next.reviewDate.localeCompare(current.reviewDate));

  const createRiderRow = (rider) => {
    const company = logisticsCompaniesById.get(
      getId(rider.logistics_company_id ?? rider.company_id),
    );
    const status = toDisplayText(
      rider.availability_status ?? rider.employment_status,
      'Pending',
    );
    const employmentStatus = toDisplayText(
      rider.employment_status,
      'Pending approval',
    );
    const vehicle = toDisplayText(rider.vehicle_type, 'Vehicle not recorded');
    const deliveries = getNumber(rider.total_deliveries);

    return {
      approvalStatus: employmentStatus === 'Active' ? 'Approved' : employmentStatus,
      approvalTone: getTone(employmentStatus),
      category: company
        ? getText(company.company_name, 'Logistics company')
        : 'Logistics company not recorded',
      entityId: getId(rider.rider_id),
      primary: getText(
        rider.full_name,
        getName(rider, `Rider ${getId(rider.rider_id)}`),
      ),
      secondary: getText(rider.email ?? rider.contact_number, 'Contact not recorded'),
      status,
      tone: getTone(status),
      value: `${vehicle} · ${deliveries} ${deliveries === 1 ? 'delivery' : 'deliveries'}`,
    };
  };

  return {
    Admins: admins.map((admin) => {
      const userId = getId(admin.user_id);
      const user = usersById.get(userId);
      const status = 'Active';

      return {
        category: toDisplayText(admin.admin_role, 'Administrator'),
        primary: user ? getName(user, `Admin ${userId}`) : `Admin ${userId}`,
        secondary: user ? getText(user.email, 'Email not recorded') : 'User account not recorded',
        status,
        tone: getTone(status),
        value: `Assigned ${formatDate(admin.date_assigned)}`,
      };
    }),
    'Admin Roles': adminRoles.map((role) => ({
      category: `Level ${getNumber(role.role_level)}`,
      primary: toDisplayText(role.role_name, 'Administrator role'),
      secondary: `Admin user ${getId(role.user_id) || 'Not recorded'}`,
      status: 'Active',
      tone: 'green',
      value: getText(role.description, 'No description'),
    })),
    Buyers: buyers.map((buyer) => {
      const user = usersById.get(getId(buyer.user_id));
      const status = user ? toAccountStatus(user.account_status) : 'Inactive';

      return {
        category: 'Buyer account',
        primary: user ? getName(user, 'Buyer') : `Buyer ${getId(buyer.buyer_user_id)}`,
        secondary: user ? getText(user.email, 'Email not recorded') : 'User account not recorded',
        status,
        tone: getTone(status),
        value: `Preferred payment: ${toDisplayText(buyer.preferred_payment_method, 'Not set')}`,
      };
    }),
    'Cart Items': cartItems.map((item) => ({
      category: 'Cart item',
      primary: `Cart item ${getId(item.cart_item_id)}`,
      secondary: `Cart ${getId(item.cart_id)}`,
      status: 'In cart',
      tone: 'blue',
      value: `${getNumber(item.quantity)} units`,
    })),
    Carts: carts.map((cart) => ({
      category: 'Buyer cart',
      primary: `Cart ${getId(cart.cart_id)}`,
      secondary: `Buyer ${getId(cart.buyer_user_id)}`,
      status: toDisplayText(cart.cart_status, 'Active'),
      tone: getTone(cart.cart_status ?? 'active'),
      value: `Created ${formatDate(cart.created_at)}`,
    })),
    Categories: categories.map((category) => ({
      category: 'Commodity category',
      primary: getText(category.category_name, `Category ${getId(category.category_id)}`),
      secondary: getText(category.description, 'No description'),
      status: toDisplayText(category.status, 'Active'),
      tone: getTone(category.status ?? 'active'),
      value: `Farm ${getId(category.farm_id)}`,
    })),
    Commodities: commodities.map((commodity) => {
      const farm = farmsById.get(getId(commodity.farm_id));
      const category = categoriesById.get(getId(commodity.category_id));
      const status = toDisplayText(commodity.commodity_status, 'Available');

      return {
        category: category
          ? getText(category.category_name, 'Uncategorized')
          : 'Uncategorized',
        primary: getText(commodity.commodity_name, `Commodity ${getId(commodity.commodity_id)}`),
        secondary: farm ? getText(farm.farm_name, 'Farm not named') : 'Farm not recorded',
        status,
        tone: getTone(status),
        value: `${formatMoney(commodity.price_per_unit)} / ${getText(commodity.unit_type, 'unit')}`,
      };
    }),
    Deliveries: deliveries.map((delivery) => {
      const status = toDisplayText(delivery.delivery_status, 'Pending');

      return {
        category: `Order #AG-${getId(delivery.order_id)}`,
        primary: `Delivery ${getId(delivery.delivery_id)}`,
        secondary: getText(delivery.dropoff_location, 'Drop-off location not set'),
        status,
        tone: getTone(status),
        value: `ETA: ${formatDate(delivery.estimated_delivery_time)}`,
      };
    }),
    Farmers: farmerRows,
    Farms: farmerFarms.map((farm) => ({
      category: farm.farmingType,
      entityId: farm.id,
      gpsLat: farm.gpsLat,
      gpsLong: farm.gpsLong,
      primary: farm.farmName,
      secondary: farm.farmLocation,
      status: farm.status,
      tone: farm.tone,
      value: `${farm.farmSizeHectares} hectares`,
    })),
    'Logistics Companies': riders.map(createRiderRow),
    'Order Items': orderItems.map((item) => {
      const order = ordersById.get(getId(item.order_id));

      return {
        category: `Order #AG-${getId(item.order_id)}`,
        primary: `Order item ${getId(item.order_item_id)}`,
        secondary: order ? toOrderStatus(order) : 'Order not recorded',
        status: 'Recorded',
        tone: 'blue',
        value: `${getNumber(item.quantity)} units · ${formatMoney(item.total_price)}`,
      };
    }),
    Orders: orders.map((order) => ({
      category: toOrderStatus(order),
      primary: `Order #AG-${getId(order.order_id)}`,
      secondary: formatDate(order.order_date ?? order.created_at),
      status: toOrderStatus(order),
      tone: getTone(order.order_status ?? order.payment_status),
      value: formatMoney(order.total_amount),
    })),
    Payments: payments.map((payment) => ({
      category: toDisplayText(payment.payment_method, 'Not set'),
      primary: `Payment ${getId(payment.payment_id)}`,
      secondary: `Order #AG-${getId(payment.order_id)}`,
      status: toPaymentStatus(payment.collection_status ?? payment.payment_status),
      tone: getTone(payment.collection_status ?? payment.payment_status),
      value: formatMoney(payment.amount),
    })),
    Reviews: reviewRows,
    Riders: riders.map(createRiderRow),
    Users: users.map((user) => ({
      category: toDisplayText(user.account_role, 'User'),
      primary: getName(user, `User ${getId(user.user_id)}`),
      secondary: getText(user.email, 'Email not recorded'),
      status: toAccountStatus(user.account_status),
      tone: getTone(user.account_status),
      value: `Joined ${formatDate(user.created_at)}`,
    })),
  };
};

const getDashboardData = async () => {
  const [
    users,
    admins,
    adminRoles,
    buyers,
    farmers,
    farms,
    categories,
    commodities,
    carts,
    cartItems,
    orders,
    orderItems,
    reviews,
    riderRatings,
    payments,
    deliveries,
    logisticsCompanies,
    riders,
  ] = await Promise.all(
    [
      'users',
      'admins',
      'admin_roles',
      'buyers',
      'farmers',
      'farms',
      'categories',
      'commodities',
      'carts',
      'cart_items',
      'orders',
      'order_items',
      'reviews',
      'rider_ratings',
      'payments',
      'deliveries',
      'logistics_companies',
      'riders',
    ].map(getSupabaseRows),
  );
  const tableData = {
    adminRoles: asRows(adminRoles),
    admins: asRows(admins),
    buyers: asRows(buyers),
    cartItems: asRows(cartItems),
    carts: asRows(carts),
    categories: asRows(categories),
    commodities: asRows(commodities),
    deliveries: asRows(deliveries),
    farmers: asRows(farmers),
    farms: asRows(farms),
    logisticsCompanies: asRows(logisticsCompanies),
    orderItems: asRows(orderItems),
    orders: asRows(orders),
    payments: asRows(payments),
    reviews: asRows(reviews),
    riderRatings: asRows(riderRatings),
    riders: asRows(riders),
    users: asRows(users),
  };
  const buyersByUser = createIndex(tableData.buyers, 'user_id');
  const buyersById = createIndex(tableData.buyers, 'buyer_user_id');
  const adminsByUser = createIndex(tableData.admins, 'user_id');
  const usersById = createIndex(tableData.users, 'user_id');
  const commoditiesByFarm = groupRows(tableData.commodities, 'farm_id');
  const commoditiesById = createIndex(tableData.commodities, 'commodity_id');
  const cartItemsById = createIndex(tableData.cartItems, 'cart_item_id');
  const cartsById = createIndex(tableData.carts, 'cart_id');
  const farmsByFarmer = groupRows(tableData.farms, 'farmer_user_id');
  const farmerFarms = createFarmerFarms({
    commoditiesByFarm,
    farms: tableData.farms,
  });
  const farmerRows = createFarmerRows({
    farmers: tableData.farmers,
    farmsByFarmer,
  });
  const orderRows = createOrderRows({
    buyersById,
    cartItemsById,
    cartsById,
    commoditiesById,
    orders: tableData.orders,
    usersById,
  });
  const orderRowsById = new Map(
    orderRows.map((order) => [order.id.replace(/^AG-/, ''), order]),
  );
  const ordersById = createIndex(tableData.orders, 'order_id');
  const paymentRows = createPaymentRows({
    orderRowsById,
    ordersById,
    payments: tableData.payments,
  });
  const totalSales = paymentRows
    .filter(isCompletedPayment)
    .reduce((total, payment) => total + getPaymentAmount(payment), 0);
  const activeFarmers = tableData.farmers.filter(
    (farmer) =>
      getText(farmer.verification_status).toLowerCase() === 'verified' &&
      toAccountStatus(farmer.account_status) === 'Active',
  ).length;
  const activeListings = tableData.commodities.filter(
    (commodity) => !/(sold|archived|inactive)/.test(getText(commodity.commodity_status).toLowerCase()),
  ).length;
  const lowStock = tableData.commodities.filter((commodity) => {
    const quantity = commodity.available_quantity;

    return quantity !== null && quantity !== undefined && quantity !== '' &&
      getNumber(quantity) <= 5;
  }).length;
  const categoryNames = createIndex(tableData.categories, 'category_id');
  const commodityMixCounts = tableData.orders.reduce((counts, order) => {
    const cartItem = cartItemsById.get(getId(order.cart_item_id));
    const commodity = cartItem ? commoditiesById.get(getId(cartItem.commodity_id)) : undefined;
    const category = commodity
      ? categoryNames.get(getId(commodity.category_id))
      : undefined;
    const name = category
      ? getText(category.category_name, 'Uncategorized')
      : 'Uncategorized';

    counts.set(name, (counts.get(name) ?? 0) + 1);
    return counts;
  }, new Map());
  const commodityMix = Array.from(commodityMixCounts.entries())
    .sort(([, currentCount], [, nextCount]) => nextCount - currentCount)
    .slice(0, COMMODITY_COLORS.length)
    .map(([name, ordersCount], index) => ({
      color: COMMODITY_COLORS[index],
      name,
      orders: ordersCount,
    }));
  const deliveryCounts = tableData.deliveries.reduce((counts, delivery) => {
    const bucket = getDeliveryBucket(delivery.delivery_status);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    return counts;
  }, new Map());

  return {
    entityRows: createEntityRows({
      ...tableData,
      farmerFarms,
      farmerRows,
      usersById,
    }),
    farmerFarms,
    farmers: farmerRows,
    orders: orderRows,
    overview: {
      activeFarmers,
      activeListings,
      commodityMix,
      deliveryStatuses: DELIVERY_STATUSES.map((status) => ({
        ...status,
        value: deliveryCounts.get(status.label) ?? 0,
      })),
      lowStock,
      paymentActivityBars: getPaymentActivityBars(paymentRows),
      salesTrend: getSalesTrend(paymentRows),
      totalOrders: orderRows.length,
      totalSales,
    },
    payments: paymentRows,
    users: createUserRows({
      adminsByUser,
      buyersByUser,
      users: tableData.users,
    }),
  };
};

const approveFarmer = async (farmerId) => {
  const normalizedFarmerId = getId(farmerId);

  if (!normalizedFarmerId) return null;

  const updatedFarmers = await updateSupabaseRows(
    'farmers',
    { farmer_user_id: `eq.${normalizedFarmerId}` },
    { verification_status: 'verified' },
  );

  return updatedFarmers[0] ?? null;
};

const approveRider = async (riderId) => {
  const normalizedRiderId = getId(riderId);

  if (!normalizedRiderId) return null;

  const updatedRiders = await updateSupabaseRows(
    'riders',
    { rider_id: `eq.${normalizedRiderId}` },
    { employment_status: 'active' },
  );

  return updatedRiders[0] ?? null;
};

module.exports = { approveFarmer, approveRider, getDashboardData };
