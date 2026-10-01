import { ADMIN_PERMISSIONS } from "../config.ts";
import type { Row } from "../types.ts";
import {
  date,
  display,
  id,
  indexBy,
  money,
  name,
  number,
  paymentStatus,
  text,
  tone,
} from "../value.ts";
import { permissionsFromRole, regularAdminPermissions } from "./auth.ts";
import { createEntityRows, createFarmerData } from "./dashboardEntities.ts";
import { getDashboardTables } from "./dashboardTables.ts";

const COMMODITY_COLORS = [
  "#71a972",
  "#f0b678",
  "#8db7d6",
  "#9f8bc5",
  "#d9dfda",
];
const DELIVERY_STATUSES = [
  { color: "#71a972", dotClass: "dot-green", label: "Delivered" },
  { color: "#f0b678", dotClass: "dot-orange", label: "In transit" },
  { color: "#d9dfda", dotClass: "dot-gray", label: "Awaiting pickup" },
];

const initials = (value: string) =>
  value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "AG";

const isCompletedPayment = (payment: Row) =>
  paymentStatus(payment.collection_status ?? payment.payment_status) ===
  "Completed";

const CLOSED_DELIVERY_STATUSES = new Set([
  "completed", "delivered", "cancelled", "failed", "returned",
]);

const latestDeliveriesByOrder = (deliveries: Row[]) => {
  const latest = new Map<string, Row>();
  for (const delivery of deliveries) {
    const orderId = id(delivery.order_id);
    const current = latest.get(orderId);
    if (orderId && (!current || number(delivery.delivery_id) > number(current.delivery_id))) {
      latest.set(orderId, delivery);
    }
  }
  return latest;
};

const isDeliveryOverdue = (delivery: Row | undefined, now: number) => {
  if (!delivery || CLOSED_DELIVERY_STATUSES.has(text(delivery.delivery_status).toLowerCase())) {
    return false;
  }
  const estimate = Date.parse(text(delivery.estimated_delivery_time));
  return Number.isFinite(estimate) && estimate < now;
};

const salesTrend = (payments: Row[]) => {
  const dateKey = (value: Date) => value.toISOString().slice(0, 10);
  const days = Array.from({ length: 365 }, (_, index) => {
    const value = new Date();
    value.setUTCHours(0, 0, 0, 0);
    value.setUTCDate(value.getUTCDate() - (364 - index));
    return value;
  });
  const totals = new Map(
    days.map((day) => [
      dateKey(day),
      { orders: new Set<string>(), revenue: 0 },
    ]),
  );
  payments.forEach((payment) => {
    if (!isCompletedPayment(payment)) return;
    const paidAt = new Date(
      text(payment.payment_date ?? payment.recorded_at ?? payment.created_at),
    );
    if (Number.isNaN(paidAt.getTime())) return;
    const total = totals.get(dateKey(paidAt));
    if (!total) return;
    total.revenue += number(payment.amount);
    total.orders.add(id(payment.order_id));
  });
  return days.map((day) => ({
    date: dateKey(day),
    orders: totals.get(dateKey(day))?.orders.size ?? 0,
    revenue: totals.get(dateKey(day))?.revenue ?? 0,
  }));
};

const monthKey = (value: Date) =>
  `${value.getUTCFullYear()}-${value.getUTCMonth()}`;

const paymentActivityBars = (payments: Row[]) => {
  const months = Array.from({ length: 12 }, (_, index) => {
    const value = new Date();
    value.setUTCHours(0, 0, 0, 0);
    value.setUTCDate(1);
    value.setUTCMonth(value.getUTCMonth() - (11 - index));
    return value;
  });
  const totals = new Map(months.map((month) => [monthKey(month), 0]));
  payments.forEach((payment) => {
    if (!isCompletedPayment(payment)) return;
    const paidAt = new Date(
      text(payment.payment_date ?? payment.recorded_at ?? payment.created_at),
    );
    if (Number.isNaN(paidAt.getTime())) return;
    const key = monthKey(paidAt);
    if (totals.has(key))
      totals.set(key, (totals.get(key) ?? 0) + number(payment.amount));
  });
  const amounts = months.map((month) => totals.get(monthKey(month)) ?? 0);
  const maximum = Math.max(...amounts, 0);
  return amounts.map((amount) =>
    maximum === 0 ? 0 : Math.max(8, Math.round((amount / maximum) * 100)),
  );
};

const deliveryBucket = (status: unknown) => {
  const normalized = text(status).toLowerCase();
  if (/(delivered|completed)/.test(normalized)) return "Delivered";
  if (/(transit|delivery|picked|out[_ -]?for)/.test(normalized))
    return "In transit";
  return "Awaiting pickup";
};

const commodityMix = (
  tables: Record<string, Row[]>,
  cartItemsById: Map<string, Row>,
  commoditiesById: Map<string, Row>,
  categoriesById: Map<string, Row>,
) => {
  const counts = new Map<string, number>();
  tables.orders.forEach((order) => {
    const cartItem = cartItemsById.get(id(order.cart_item_id));
    const commodity = cartItem
      ? commoditiesById.get(id(cartItem.commodity_id))
      : undefined;
    const category = commodity
      ? categoriesById.get(id(commodity.category_id))
      : undefined;
    const categoryName = category
      ? text(category.category_name, "Uncategorized")
      : "Uncategorized";
    counts.set(categoryName, (counts.get(categoryName) ?? 0) + 1);
  });
  return [...counts.entries()]
    .sort((current, next) => next[1] - current[1])
    .slice(0, COMMODITY_COLORS.length)
    .map(([categoryName, orderCount], index) => ({
      color: COMMODITY_COLORS[index],
      name: categoryName,
      orders: orderCount,
    }));
};

const createIndexes = (tables: Record<string, Row[]>) => ({
  adminRolesByUserId: indexBy(tables.admin_roles, "user_id"),
  buyersById: indexBy(tables.buyers, "buyer_user_id"),
  buyersByUserId: indexBy(tables.buyers, "user_id"),
  cartItemsById: indexBy(tables.cart_items, "cart_item_id"),
  cartsById: indexBy(tables.carts, "cart_id"),
  categoriesById: indexBy(tables.categories, "category_id"),
  commoditiesById: indexBy(tables.commodities, "commodity_id"),
  companiesById: indexBy(tables.logistics_companies, "logistics_company_id"),
  deliveriesById: indexBy(tables.deliveries, "delivery_id"),
  farmersByAuthId: indexBy(tables.farmers, "auth_user_id"),
  farmersByUserId: indexBy(tables.farmers, "farmer_user_id"),
  farmsById: indexBy(tables.farms, "farm_id"),
  ordersById: indexBy(tables.orders, "order_id"),
  ridersById: indexBy(tables.riders, "rider_id"),
  usersById: indexBy(tables.users, "user_id"),
});

export const getDashboard = async () => {
  const tables = await getDashboardTables();
  const indexes = createIndexes(tables);
  const deliveriesByOrder = latestDeliveriesByOrder(tables.deliveries);
  const now = Date.now();
  const { farmerFarms, farmerRecords } = createFarmerData(
    tables,
    indexes.usersById,
  );
  const entityRows = createEntityRows(
    tables,
    indexes,
    farmerRecords,
    farmerFarms,
  );
  const orders = tables.orders
    .map((order) => {
      const cartItem = indexes.cartItemsById.get(id(order.cart_item_id));
      const cart = cartItem
        ? indexes.cartsById.get(id(cartItem.cart_id))
        : undefined;
      const buyer = cart
        ? indexes.buyersById.get(id(cart.buyer_user_id))
        : undefined;
      const user = buyer ? indexes.usersById.get(id(buyer.user_id)) : undefined;
      const commodity = cartItem
        ? indexes.commoditiesById.get(id(cartItem.commodity_id))
        : undefined;
      const customer = user ? name(user, "Customer") : "Customer not recorded";
      const quantity = number(cartItem?.quantity);
      const totalAmount = number(
        order.total_amount,
        quantity * number(cartItem?.price_at_time),
      );
      const status = isDeliveryOverdue(deliveriesByOrder.get(id(order.order_id)), now)
        ? "Overdue"
        : display(order.order_status ?? order.payment_status, "Pending");
      return {
        customer,
        id: `AG-${id(order.order_id)}`,
        initial: initials(customer),
        item: commodity
          ? text(commodity.commodity_name, "Unnamed commodity")
          : "Commodity not recorded",
        qty: `${quantity} ${text(commodity?.unit_type, "unit")}`,
        status,
        time: date(order.order_date ?? order.created_at),
        tone: tone(status),
        total: money(totalAmount),
      };
    })
    .sort(
      (current, next) =>
        number(next.id.replace(/\D/g, "")) -
        number(current.id.replace(/\D/g, "")),
    );
  const orderRowsById = new Map(
    orders.map((order) => [order.id.replace(/^AG-/, ""), order]),
  );
  const payments = tables.payments
    .map((payment) => {
      const orderId = id(payment.order_id);
      const order = indexes.ordersById.get(orderId);
      const amountValue = number(payment.amount);
      const hasNetAmount =
        payment.amount_received !== null &&
        payment.amount_received !== undefined &&
        payment.amount_received !== "";
      const netValue = hasNetAmount
        ? number(payment.amount_received)
        : amountValue;
      const status = paymentStatus(
        payment.collection_status ?? payment.payment_status,
      );
      const paidAt = text(
        payment.payment_date ?? payment.recorded_at ?? payment.created_at,
      );
      return {
        amount: money(amountValue),
        amountValue,
        customer:
          orderRowsById.get(orderId)?.customer ?? "Customer not recorded",
        fee: hasNetAmount
          ? money(Math.max(0, amountValue - netValue))
          : "Not recorded",
        id: `PY-${id(payment.payment_id)}`,
        method: display(
          payment.payment_method ?? order?.payment_method,
          "Not set",
        ),
        net: money(netValue),
        order: `Order #AG-${orderId}`,
        paidAt,
        settlement: display(
          payment.settlement_status ?? payment.collection_status,
          status === "Completed" ? "Ready" : "Confirming",
        ),
        settlementStatus: display(
          payment.settlement_status ?? payment.collection_status,
          "pending",
        ),
        transactionReference: text(payment.transaction_reference),
        verificationStatus: display(payment.verification_status, "unverified"),
        status,
        time: date(paidAt),
        tone: tone(status),
      };
    })
    .sort((current, next) => next.paidAt.localeCompare(current.paidAt));
  const users = tables.users.map((user) => {
    const buyer = indexes.buyersByUserId.get(id(user.user_id));
    const role = display(user.account_role, buyer ? "Buyer" : "User");
    const rawStatus = text(user.account_status).toLowerCase();
    const accountStatus =
      rawStatus === "pending"
        ? "Pending"
        : rawStatus === "suspended"
          ? "Suspended"
          : rawStatus === "rejected"
            ? "Rejected"
            : ["deactivated", "inactive", "cancelled"].includes(rawStatus)
              ? "Deactivated"
              : "Active";
    return {
      accountStatus,
      businessName: text(buyer?.business_name),
      buyerUserId: id(buyer?.buyer_user_id),
      contactNumber: text(user.contact_number, "Not provided"),
      createdAt: date(user.created_at),
      dateOfBirth: text(user.date_of_birth).slice(0, 10) || "Not recorded",
      eWalletDetails: text(user.e_wallet_details, "Not linked"),
      email: text(user.email, "Not provided"),
      extensionName: text(user.extension_name),
      firstName: text(user.first_name),
      gender: text(user.gender, "Not specified"),
      lastName: text(user.last_name),
      loyaltyPoints: number(buyer?.loyalty_points),
      middleName: text(user.middle_name),
      preferredPaymentMethod: text(buyer?.preferred_payment_method),
      updatedAt: date(user.updated_at),
      userId: id(user.user_id),
      userType: ["Admin", "Buyer", "Farmer", "Rider"].includes(role)
        ? role
        : "User",
    };
  });
  const administrators = tables.admins.flatMap((administrator) => {
    const userId = id(administrator.user_id);
    const role = text(administrator.admin_role).toLowerCase();
    if (!userId || !["admin", "super_admin"].includes(role)) return [];
    const user = indexes.usersById.get(userId);
    const stored = permissionsFromRole(indexes.adminRolesByUserId.get(userId));
    return [
      {
        email: text(user?.email, "Email not recorded"),
        enabled: text(user?.account_status).toLowerCase() === "active",
        name: user ? name(user, `Admin ${userId}`) : `Admin ${userId}`,
        permissions:
          role === "super_admin"
            ? [...ADMIN_PERMISSIONS, "admin:manage"]
            : regularAdminPermissions(stored),
        role,
        userId,
      },
    ];
  });
  const completed = payments.filter(
    (payment) => payment.status === "Completed",
  );
  const deliveryCounts = tables.deliveries.reduce((counts, delivery) => {
    const bucket = deliveryBucket(delivery.delivery_status);
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  return {
    administrators,
    entityRows,
    farmerFarms,
    farmers: farmerRecords,
    orders,
    payments,
    users,
    overview: {
      activeFarmers: farmerRecords.filter(
        (farmer) => farmer.status === "Verified",
      ).length,
      activeListings: tables.commodities.filter(
        (commodity) =>
          !/(sold|archived|inactive)/i.test(text(commodity.commodity_status)),
      ).length,
      commodityMix: commodityMix(
        tables,
        indexes.cartItemsById,
        indexes.commoditiesById,
        indexes.categoriesById,
      ),
      deliveryStatuses: DELIVERY_STATUSES.map((status) => ({
        ...status,
        value: deliveryCounts.get(status.label) ?? 0,
      })),
      lowStock: tables.commodities.filter((commodity) => {
        const quantity = commodity.available_quantity;
        return (
          quantity !== null &&
          quantity !== undefined &&
          quantity !== "" &&
          number(quantity, Infinity) <= 5
        );
      }).length,
      paymentActivityBars: paymentActivityBars(tables.payments),
      salesTrend: salesTrend(tables.payments),
      totalOrders: orders.length,
      totalSales: completed.reduce(
        (total, payment) => total + payment.amountValue,
        0,
      ),
    },
  };
};
