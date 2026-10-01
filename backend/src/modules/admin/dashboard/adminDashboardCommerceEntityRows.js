// Maps commerce records into entity-workspace rows.
const {
  createIndex, formatDate, formatMoney, getId, getNumber, getText, getTone,
  toDisplayText, toOrderStatus, toPaymentStatus,
} = require('./adminDashboardValue');

const createCommerceEntityRows = (data) => {
  const farmsById = createIndex(data.farms, 'farm_id');
  const categoriesById = createIndex(data.categories, 'category_id');
  const ordersById = createIndex(data.orders, 'order_id');
  return {
    'Cart Items': data.cartItems.map((item) => ({
      category: 'Cart item', primary: `Cart item ${getId(item.cart_item_id)}`,
      secondary: `Cart ${getId(item.cart_id)}`, status: 'In cart', tone: 'blue',
      value: `${getNumber(item.quantity)} units`,
    })),
    Carts: data.carts.map((cart) => ({
      category: 'Buyer cart', primary: `Cart ${getId(cart.cart_id)}`,
      secondary: `Buyer ${getId(cart.buyer_user_id)}`,
      status: toDisplayText(cart.cart_status, 'Active'),
      tone: getTone(cart.cart_status ?? 'active'), value: `Created ${formatDate(cart.created_at)}`,
    })),
    Categories: data.categories.map((category) => ({
      category: 'Commodity category',
      entityId: getId(category.category_id),
      primary: getText(category.category_name, `Category ${getId(category.category_id)}`),
      secondary: getText(category.description, 'No description'),
      status: toDisplayText(category.status, 'Active'), tone: getTone(category.status ?? 'active'),
      value: `Farm ${getId(category.farm_id)}`,
    })),
    Commodities: data.commodities.map((commodity) => {
      const farm = farmsById.get(getId(commodity.farm_id));
      const category = categoriesById.get(getId(commodity.category_id));
      const status = toDisplayText(commodity.commodity_status, 'Available');
      return {
        category: category ? getText(category.category_name, 'Uncategorized') : 'Uncategorized',
        primary: getText(commodity.commodity_name, `Commodity ${getId(commodity.commodity_id)}`),
        secondary: farm ? getText(farm.farm_name, 'Farm not named') : 'Farm not recorded',
        status, tone: getTone(status),
        value: `${formatMoney(commodity.price_per_unit)} / ${getText(commodity.unit_type, 'unit')}`,
      };
    }),
    'Order Items': data.orderItems.map((item) => {
      const order = ordersById.get(getId(item.order_id));
      return {
        category: `Order #AG-${getId(item.order_id)}`,
        primary: `Order item ${getId(item.order_item_id)}`,
        secondary: order ? toOrderStatus(order) : 'Order not recorded',
        status: 'Recorded', tone: 'blue',
        value: `${getNumber(item.quantity)} units · ${formatMoney(item.total_price)}`,
      };
    }),
    Orders: data.orders.map((order) => ({
      category: toOrderStatus(order), primary: `Order #AG-${getId(order.order_id)}`,
      secondary: formatDate(order.order_date ?? order.created_at), status: toOrderStatus(order),
      tone: getTone(order.order_status ?? order.payment_status), value: formatMoney(order.total_amount),
    })),
    Payments: data.payments.map((payment) => ({
      category: toDisplayText(payment.payment_method, 'Not set'),
      primary: `Payment ${getId(payment.payment_id)}`,
      secondary: `Order #AG-${getId(payment.order_id)}`,
      status: toPaymentStatus(payment.collection_status ?? payment.payment_status),
      tone: getTone(payment.collection_status ?? payment.payment_status),
      value: formatMoney(payment.amount),
    })),
  };
};

module.exports = { createCommerceEntityRows };
