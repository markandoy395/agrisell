// Maps core dashboard tables into public rows.
const {
  formatDate,
  formatMoney,
  formatRelativeTime,
  getId,
  getInitials,
  getName,
  getNumber,
  getText,
  getTextArray,
  getTone,
  toAccountStatus,
  toDisplayText,
  toOrderStatus,
  toPaymentStatus,
} = require('./adminDashboardValue');

const CLOSED_DELIVERY_STATUSES = new Set([
  'completed', 'delivered', 'cancelled', 'failed', 'returned',
]);

const latestDeliveriesByOrder = (deliveries) => {
  const latest = new Map();
  for (const delivery of deliveries) {
    const orderId = getId(delivery.order_id);
    const current = latest.get(orderId);
    if (orderId && (!current || getNumber(delivery.delivery_id) > getNumber(current.delivery_id))) {
      latest.set(orderId, delivery);
    }
  }
  return latest;
};

const isDeliveryOverdue = (delivery, now) => {
  if (!delivery || CLOSED_DELIVERY_STATUSES.has(getText(delivery.delivery_status).toLowerCase())) {
    return false;
  }
  const estimate = Date.parse(getText(delivery.estimated_delivery_time));
  return Number.isFinite(estimate) && estimate < now;
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
        getText(commodity.commodity_name, 'Unnamed commodity')),
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
    const accountStatus = getText(farmer.account_status).toLowerCase();
    const status = toDisplayText(
      ['suspended', 'deactivated', 'inactive'].includes(accountStatus)
        ? accountStatus
        : farmer.verification_status ?? farmer.account_status,
      'Pending',
    );
    return {
      category: firstFarm ? toDisplayText(firstFarm.farming_type, 'Farmer') : 'Farmer',
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
      dateOfBirth: getText(user.date_of_birth).slice(0, 10) || 'Not recorded',
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
        ? toDisplayText(buyer.preferred_payment_method, 'Not set') : undefined,
      profilePhotoUrl: getText(user.profile_photo_url) || undefined,
      shippingAddress: buyer ? getText(buyer.shipping_address) : undefined,
      updatedAt: formatDate(user.updated_at),
      userId: `USR-${userId || 'record'}`,
      userType,
    };
  });

const createOrderRows = ({
  orders, deliveries = [], cartItemsById, cartsById, buyersById, usersById, commoditiesById,
}) => {
  const deliveriesByOrder = latestDeliveriesByOrder(deliveries);
  const now = Date.now();
  return orders.map((order) => {
    const cartItem = cartItemsById.get(getId(order.cart_item_id));
    const cart = cartItem ? cartsById.get(getId(cartItem.cart_id)) : undefined;
    const buyer = cart ? buyersById.get(getId(cart.buyer_user_id)) : undefined;
    const user = buyer ? usersById.get(getId(buyer.user_id)) : undefined;
    const commodity = cartItem ? commoditiesById.get(getId(cartItem.commodity_id)) : undefined;
    const customer = user ? getName(user, 'Customer') : 'Customer not recorded';
    const totalAmount = getNumber(
      order.total_amount,
      getNumber(cartItem?.quantity) * getNumber(cartItem?.price_at_time),
    );
    const status = isDeliveryOverdue(deliveriesByOrder.get(getId(order.order_id)), now)
      ? 'Overdue'
      : toOrderStatus(order);
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
  }).sort((current, next) =>
    Number(next.id.replace(/\D/g, '')) - Number(current.id.replace(/\D/g, '')));
};

const createPaymentRows = ({ payments, ordersById, orderRowsById }) =>
  payments.map((payment) => {
    const orderId = getId(payment.order_id);
    const order = ordersById.get(orderId);
    const orderRow = orderRowsById.get(orderId);
    const amountValue = getNumber(payment.amount);
    const netValue = getNumber(payment.amount_received, amountValue);
    const status = toPaymentStatus(payment.collection_status ?? payment.payment_status);
    return {
      amount: formatMoney(amountValue), amountValue,
      customer: orderRow?.customer ?? 'Customer not recorded',
      fee: payment.amount_received == null ? 'Not recorded' : formatMoney(Math.max(0, amountValue - netValue)),
      id: `PY-${getId(payment.payment_id) || 'record'}`,
      method: toDisplayText(payment.payment_method ?? order?.payment_method, 'Not set'),
      net: formatMoney(netValue), order: `Order #AG-${orderId || 'record'}`,
      paidAt: getText(payment.payment_date ?? payment.recorded_at ?? payment.created_at),
      settlement: toDisplayText(payment.collection_status, status === 'Completed' ? 'Ready' : 'Confirming'),
      settlementStatus: toDisplayText(payment.settlement_status ?? payment.collection_status, 'pending'),
      transactionReference: getText(payment.transaction_reference),
      verificationStatus: toDisplayText(payment.verification_status, 'unverified'),
      status,
      time: formatRelativeTime(payment.payment_date ?? payment.recorded_at ?? payment.created_at),
      tone: getTone(status),
    };
  }).sort((current, next) => next.paidAt.localeCompare(current.paidAt));

module.exports = { createFarmerFarms, createFarmerRows, createOrderRows, createPaymentRows, createUserRows };
