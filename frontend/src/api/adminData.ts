import { ApiRequestError, requestAdminApi } from "./adminAuth";
import type { AdminDatabaseData, AdministratorRecord } from "../types/adminData";
import type {
  EntityRecord,
  FarmerFarm,
  OrderRow,
  PaymentRecord,
  UserWorkspaceRow,
} from "../types/dashboard";

export type CreateUserInput = {
  accountType: "user" | "farmer";
  addressLine?: string;
  barangay?: string;
  bankDetails?: string;
  certification?: string;
  cityMunicipality?: string;
  contactNumber?: string;
  dateOfBirth?: string;
  email: string;
  eWalletDetails?: string;
  extensionName?: string;
  firstName: string;
  gender?: string;
  lastName: string;
  middleName?: string;
  password: string;
  postalCode?: string;
  province?: string;
  verificationStatus?: "pending" | "verified";
  yearsOfExperience?: string;
};

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const getArray = (value: unknown) => (Array.isArray(value) ? value : []);

const getNumber = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const getString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const getStringArray = (value: unknown) =>
  getArray(value).filter((item): item is string => typeof item === "string");

const parseEntityRecord = (value: unknown): EntityRecord => {
  const row = isRecord(value) ? value : {};
  const gpsLat = getNumber(row.gpsLat, Number.NaN);
  const gpsLong = getNumber(row.gpsLong, Number.NaN);

  return {
    approvalStatus: getString(row.approvalStatus) || undefined,
    approvalTone: getString(row.approvalTone) || undefined,
    category: getString(row.category, "Not set"),
    comment: getString(row.comment) || undefined,
    entityId: getString(row.entityId) || undefined,
    gpsLat: Number.isFinite(gpsLat) ? gpsLat : undefined,
    gpsLong: Number.isFinite(gpsLong) ? gpsLong : undefined,
    primary: getString(row.primary, "Unnamed record"),
    rating: Number.isFinite(getNumber(row.rating, Number.NaN))
      ? getNumber(row.rating)
      : undefined,
    referenceLabel: getString(row.referenceLabel) || undefined,
    reviewDate: getString(row.reviewDate) || undefined,
    reviewedName: getString(row.reviewedName) || undefined,
    reviewedType:
      getString(row.reviewedType) === "Farmer" || getString(row.reviewedType) === "Rider"
        ? (getString(row.reviewedType) as "Farmer" | "Rider")
        : undefined,
    secondary: getString(row.secondary, "Not recorded"),
    status: getString(row.status, "Pending"),
    tone: getString(row.tone, "blue"),
    value: getString(row.value, "Not set"),
  };
};

const parseOrder = (value: unknown): OrderRow => {
  const row = isRecord(value) ? value : {};

  return {
    customer: getString(row.customer, "Customer not recorded"),
    id: getString(row.id, "AG-record"),
    initial: getString(row.initial, "AG"),
    item: getString(row.item, "Commodity not recorded"),
    qty: getString(row.qty, "0 units"),
    status: getString(row.status, "Pending"),
    time: getString(row.time, "Not recorded"),
    tone: getString(row.tone, "blue"),
    total: getString(row.total, "PHP 0.00"),
  };
};

const parsePayment = (value: unknown): PaymentRecord => {
  const row = isRecord(value) ? value : {};

  return {
    amount: getString(row.amount, "PHP 0.00"),
    amountValue: getNumber(row.amountValue),
    customer: getString(row.customer, "Customer not recorded"),
    fee: getString(row.fee, "Not recorded"),
    id: getString(row.id, "PY-record"),
    method: getString(row.method, "Not set"),
    net: getString(row.net, "PHP 0.00"),
    order: getString(row.order, "Order not recorded"),
    paidAt: getString(row.paidAt),
    settlement: getString(row.settlement, "Not set"),
    status: getString(row.status) === "Completed"
      ? "Completed"
      : getString(row.status) === "Failed"
        ? "Failed"
        : "Pending",
    time: getString(row.time, "Not recorded"),
    tone: getString(row.tone, "blue"),
  };
};

const parseUser = (value: unknown): UserWorkspaceRow => {
  const row = isRecord(value) ? value : {};
  const userType = getString(row.userType);
  const accountStatus = getString(row.accountStatus);

  return {
    accountStatus: accountStatus === "Inactive" ? "Inactive" : "Active",
    businessName: getString(row.businessName) || undefined,
    buyerUserId: getString(row.buyerUserId) || undefined,
    contactNumber: getString(row.contactNumber, "Not provided"),
    createdAt: getString(row.createdAt, "Not recorded"),
    dateOfBirth: getString(row.dateOfBirth, "Not recorded"),
    eWalletDetails: getString(row.eWalletDetails, "Not linked"),
    email: getString(row.email, "Not provided"),
    extensionName: getString(row.extensionName),
    firstName: getString(row.firstName),
    gender: getString(row.gender, "Not specified"),
    gpsLat: Number.isFinite(getNumber(row.gpsLat, Number.NaN))
      ? getNumber(row.gpsLat)
      : undefined,
    gpsLong: Number.isFinite(getNumber(row.gpsLong, Number.NaN))
      ? getNumber(row.gpsLong)
      : undefined,
    lastName: getString(row.lastName),
    loyaltyPoints: Number.isFinite(getNumber(row.loyaltyPoints, Number.NaN))
      ? getNumber(row.loyaltyPoints)
      : undefined,
    middleName: getString(row.middleName),
    preferredPaymentMethod: getString(row.preferredPaymentMethod) || undefined,
    profilePhotoUrl: getString(row.profilePhotoUrl) || undefined,
    shippingAddress: getString(row.shippingAddress) || undefined,
    updatedAt: getString(row.updatedAt, "Not recorded"),
    userId: getString(row.userId, "USR-record"),
    userType:
      userType === "Admin" || userType === "Buyer" || userType === "Farmer" || userType === "Rider"
        ? userType
        : "User",
  };
};

const parseFarmerFarm = (value: unknown): FarmerFarm => {
  const row = isRecord(value) ? value : {};

  return {
    certifications: getStringArray(row.certifications),
    commodities: getStringArray(row.commodities),
    farmImages: getArray(row.farmImages)
      .filter(isRecord)
      .map((image, index) => ({
        alt: getString(image.alt, `Farm image ${index + 1}`),
        imageUrl: getString(image.imageUrl),
        title: getString(image.title, `Farm image ${index + 1}`),
      }))
      .filter((image) => image.imageUrl.length > 0),
    farmLocation: getString(row.farmLocation, "Location not set"),
    farmName: getString(row.farmName, "Unnamed farm"),
    farmSizeHectares: getNumber(row.farmSizeHectares),
    farmingType: getString(row.farmingType, "Not specified"),
    farmerId: getString(row.farmerId),
    gpsLat: getNumber(row.gpsLat),
    gpsLong: getNumber(row.gpsLong),
    id: getString(row.id),
    irrigationType: getString(row.irrigationType, "Not specified"),
    mainCrops: getStringArray(row.mainCrops),
    soilType: getString(row.soilType, "Not specified"),
    status: getString(row.status, "Pending"),
    tone: getString(row.tone, "blue"),
    totalCrops: getNumber(row.totalCrops),
  };
};

const parseEntityRows = (value: unknown) => {
  if (!isRecord(value)) return {};

  return Object.entries(value).reduce<Record<string, EntityRecord[]>>(
    (rows, [section, sectionRows]) => {
      rows[section] = getArray(sectionRows).map(parseEntityRecord);
      return rows;
    },
    {},
  );
};

const parseAdministrator = (value: unknown): AdministratorRecord | null => {
  if (!isRecord(value)) return null;
  const role = getString(value.role);
  const userId = getString(value.userId);
  if ((role !== "admin" && role !== "super_admin") || !userId) return null;

  return {
    email: getString(value.email, "Email not recorded"),
    name: getString(value.name, `Admin ${userId}`),
    permissions: getStringArray(value.permissions),
    role,
    userId,
  };
};

const parseDashboardData = (value: unknown): AdminDatabaseData => {
  if (!isRecord(value) || !isRecord(value.overview)) {
    throw new ApiRequestError("The server returned invalid dashboard data.", 500);
  }

  const overview = value.overview;

  return {
    administrators: getArray(value.administrators)
      .map(parseAdministrator)
      .filter((administrator): administrator is AdministratorRecord => administrator !== null),
    entityRows: parseEntityRows(value.entityRows),
    farmerFarms: getArray(value.farmerFarms).map(parseFarmerFarm),
    farmers: getArray(value.farmers).map(parseEntityRecord),
    orders: getArray(value.orders).map(parseOrder),
    overview: {
      activeFarmers: getNumber(overview.activeFarmers),
      activeListings: getNumber(overview.activeListings),
      commodityMix: getArray(overview.commodityMix)
        .filter(isRecord)
        .map((item) => ({
          color: getString(item.color, "#d9dfda"),
          name: getString(item.name, "Uncategorized"),
          orders: getNumber(item.orders),
        })),
      deliveryStatuses: getArray(overview.deliveryStatuses)
        .filter(isRecord)
        .map((item) => ({
          color: getString(item.color, "#d9dfda"),
          dotClass: getString(item.dotClass, "dot-gray"),
          label: getString(item.label, "Pending"),
          value: getNumber(item.value),
        })),
      lowStock: getNumber(overview.lowStock),
      paymentActivityBars: getArray(overview.paymentActivityBars).map((item) =>
        getNumber(item),
      ),
      salesTrend: getArray(overview.salesTrend)
        .filter(isRecord)
        .map((item) => ({
          date: getString(item.date),
          orders: getNumber(item.orders),
          revenue: getNumber(item.revenue),
        })),
      totalOrders: getNumber(overview.totalOrders),
      totalSales: getNumber(overview.totalSales),
    },
    payments: getArray(value.payments).map(parsePayment),
    users: getArray(value.users).map(parseUser),
  };
};

export const getAdminDashboardData = async () =>
  parseDashboardData(await requestAdminApi("/api/admin/dashboard"));

export const createAdminUser = async (input: CreateUserInput) => {
  await requestAdminApi("/api/admin/users", {
    body: JSON.stringify(input),
    method: "POST",
  });
};

export type CreateAdministratorInput = {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
  permissions: string[];
};

export const createAdministrator = async (input: CreateAdministratorInput) => {
  await requestAdminApi("/api/admin/administrators", {
    body: JSON.stringify(input),
    method: "POST",
  });
};

export const updateAdministratorPrivileges = async (userId: string, permissions: string[]) => {
  await requestAdminApi(
    `/api/admin/administrators/${encodeURIComponent(userId)}/privileges`,
    {
      body: JSON.stringify({ permissions }),
      method: "PATCH",
    },
  );
};

export type UpdateAdminProfileInput = {
  avatarUrl?: string;
  name: string;
};

export const updateAdminProfile = async (input: UpdateAdminProfileInput) => {
  const body = await requestAdminApi("/api/admin/profile", {
    body: JSON.stringify(input),
    method: "PATCH",
  });
  const profile = isRecord(body) && isRecord(body.profile) ? body.profile : null;

  if (!profile || typeof profile.name !== "string" || typeof profile.email !== "string") {
    throw new ApiRequestError("The server returned an invalid profile.", 500);
  }

  return {
    avatarUrl: getString(profile.avatarUrl) || undefined,
    email: profile.email,
    name: profile.name,
  };
};

export const approveFarmerProfile = async (farmerId: string) => {
  if (!farmerId) {
    throw new ApiRequestError("A farmer ID is required for approval.", 400);
  }

  await requestAdminApi(
    `/api/admin/farmers/${encodeURIComponent(farmerId)}/approval`,
    { method: "PATCH" },
  );
};

export const approveRiderProfile = async (riderId: string) => {
  if (!riderId) {
    throw new ApiRequestError("A rider ID is required for approval.", 400);
  }

  await requestAdminApi(
    `/api/admin/riders/${encodeURIComponent(riderId)}/approval`,
    { method: "PATCH" },
  );
};
