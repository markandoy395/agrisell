// Builds aggregate metrics for the admin dashboard overview.
const {
  createIndex,
  getId,
  getNumber,
  getText,
  toAccountStatus,
} = require('./adminDashboardValue');

const COMMODITY_COLORS = ['#71a972', '#f0b678', '#8db7d6', '#9f8bc5', '#d9dfda'];
const DELIVERY_STATUSES = [
  { color: '#71a972', dotClass: 'dot-green', label: 'Delivered' },
  { color: '#f0b678', dotClass: 'dot-orange', label: 'In transit' },
  { color: '#d9dfda', dotClass: 'dot-gray', label: 'Awaiting pickup' },
];

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
    return { date: getDateKey(day), orders: total?.orders.size ?? 0, revenue: total?.revenue ?? 0 };
  });
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
  return values.map((value) =>
    (maximum === 0 ? 0 : Math.max(8, Math.round((value / maximum) * 100))));
};

const getDeliveryBucket = (status) => {
  const normalizedStatus = getText(status).toLowerCase();
  if (/(delivered|completed)/.test(normalizedStatus)) return 'Delivered';
  if (/(transit|delivery|picked|out_for)/.test(normalizedStatus)) return 'In transit';
  return 'Awaiting pickup';
};

const createCommodityMix = (data, cartItemsById, commoditiesById) => {
  const categoryNames = createIndex(data.categories, 'category_id');
  const counts = data.orders.reduce((result, order) => {
    const cartItem = cartItemsById.get(getId(order.cart_item_id));
    const commodity = cartItem ? commoditiesById.get(getId(cartItem.commodity_id)) : undefined;
    const category = commodity ? categoryNames.get(getId(commodity.category_id)) : undefined;
    const name = category ? getText(category.category_name, 'Uncategorized') : 'Uncategorized';
    result.set(name, (result.get(name) ?? 0) + 1);
    return result;
  }, new Map());
  return Array.from(counts.entries())
    .sort(([, current], [, next]) => next - current)
    .slice(0, COMMODITY_COLORS.length)
    .map(([name, orders], index) => ({ color: COMMODITY_COLORS[index], name, orders }));
};

const createOverview = ({ data, orderRows, paymentRows, cartItemsById, commoditiesById }) => {
  const deliveryCounts = data.deliveries.reduce((counts, delivery) => {
    const bucket = getDeliveryBucket(delivery.delivery_status);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    return counts;
  }, new Map());
  return {
    activeFarmers: data.farmers.filter((farmer) =>
      getText(farmer.verification_status).toLowerCase() === 'verified' &&
      toAccountStatus(farmer.account_status) === 'Active').length,
    activeListings: data.commodities.filter((commodity) =>
      !/(sold|archived|inactive)/.test(getText(commodity.commodity_status).toLowerCase())).length,
    commodityMix: createCommodityMix(data, cartItemsById, commoditiesById),
    deliveryStatuses: DELIVERY_STATUSES.map((status) => ({
      ...status, value: deliveryCounts.get(status.label) ?? 0,
    })),
    lowStock: data.commodities.filter((commodity) => {
      const quantity = commodity.available_quantity;
      return quantity !== null && quantity !== undefined && quantity !== '' && getNumber(quantity) <= 5;
    }).length,
    paymentActivityBars: getPaymentActivityBars(paymentRows),
    salesTrend: getSalesTrend(paymentRows),
    totalOrders: orderRows.length,
    totalSales: paymentRows.filter(isCompletedPayment)
      .reduce((total, payment) => total + getPaymentAmount(payment), 0),
  };
};

module.exports = { createOverview };
