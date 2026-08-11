// Supabase Edge Function for the Agrisell admin dashboard.
// Deploy with: supabase functions deploy admin-api

type Row = Record<string, unknown>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")?.replace(/\/+$/, "") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const QUERY_LIMIT = Number(Deno.env.get("SUPABASE_QUERY_LIMIT") ?? 1000);
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const text = (value: unknown, fallback = "") =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;
const id = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";
const number = (value: unknown, fallback = 0) => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const rows = (value: unknown): Row[] => Array.isArray(value)
  ? value.filter((item): item is Row => typeof item === "object" && item !== null && !Array.isArray(item))
  : [];
const display = (value: unknown, fallback = "Not set") => {
  const valueText = text(value);
  return valueText
    ? valueText.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : fallback;
};
const name = (row: Row, fallback: string) => {
  const fullName = text(row.full_name);
  if (fullName) return fullName;
  const parts = [row.first_name, row.middle_name, row.last_name, row.extension_name]
    .map((part) => text(part))
    .filter(Boolean);
  return parts.length ? parts.join(" ") : fallback;
};
const tone = (status: unknown) => {
  const value = text(status).toLowerCase();
  if (/(active|available|verified|completed|delivered|published|paid)/.test(value)) return "green";
  if (/(delivery|transit|processing|pending|awaiting|review)/.test(value)) return "blue";
  if (/(fail|cancel|inactive|unavailable)/.test(value)) return "red";
  return "orange";
};
const money = (value: unknown) => new Intl.NumberFormat("en-PH", {
  style: "currency", currency: "PHP",
}).format(number(value));
const date = (value: unknown) => {
  const parsed = new Date(text(value));
  return Number.isNaN(parsed.getTime()) ? "Not recorded" : new Intl.DateTimeFormat("en-PH", {
    day: "2-digit", month: "short", year: "numeric",
  }).format(parsed);
};
const indexBy = (source: Row[], field: string) => new Map(
  source.map((row) => [id(row[field]), row]).filter(([key]) => Boolean(key)),
);

const corsHeaders = (request: Request) => {
  const requestOrigin = request.headers.get("origin") ?? "";
  const permittedOrigin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : "";

  return {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, PATCH, POST, OPTIONS",
    "Access-Control-Allow-Origin": permittedOrigin,
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  };
};
const response = (request: Request, status: number, body: unknown) =>
  new Response(JSON.stringify(body), { headers: corsHeaders(request), status });

const requestSupabase = async (path: string, init: RequestInit = {}) => {
  const result = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      ...init.headers,
    },
  });
  const payload = await result.json().catch(() => null);
  if (!result.ok) throw new Error(typeof payload?.message === "string" ? payload.message : "Supabase request failed.");
  return payload;
};
const getTable = async (table: string, filters: Record<string, string> = {}) => {
  const params = new URLSearchParams({ select: "*", limit: String(QUERY_LIMIT), ...filters });
  return rows(await requestSupabase(`/rest/v1/${table}?${params}`));
};

const createUserError = (code: string, message: string, status = 400) =>
  Object.assign(new Error(message), { code, status });
const optionalField = (value: unknown, maximum: number, label: string) => {
  const result = text(value);
  if (result.length > maximum) throw createUserError("INVALID_USER_PAYLOAD", `${label} must be ${maximum} characters or fewer.`);
  return result || undefined;
};
const setIfPresent = (target: Row, field: string, value: unknown) => {
  if (value !== undefined) target[field] = value;
};

const createDashboardUser = async (payload: unknown) => {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw createUserError("INVALID_USER_PAYLOAD", "Enter the new user details.");
  }
  const body = payload as Row;
  const accountType = text(body.accountType).toLowerCase();
  const email = text(body.email).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const firstName = optionalField(body.firstName, 100, "First name");
  const lastName = optionalField(body.lastName, 100, "Last name");
  const dateOfBirth = text(body.dateOfBirth);
  const experienceText = text(body.yearsOfExperience);
  if (accountType !== "user" && accountType !== "farmer") throw createUserError("INVALID_USER_PAYLOAD", "Choose a valid account type.");
  if (!firstName || !lastName) throw createUserError("INVALID_USER_PAYLOAD", "First and last names are required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw createUserError("INVALID_USER_PAYLOAD", "Enter a valid email address.");
  if (password.length < 8 || password.length > 512) throw createUserError("INVALID_USER_PAYLOAD", "Password must be between 8 and 512 characters.");
  if (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) throw createUserError("INVALID_USER_PAYLOAD", "Enter a valid date of birth.");
  if (experienceText && (!/^\d+$/.test(experienceText) || Number(experienceText) > 120)) throw createUserError("INVALID_USER_PAYLOAD", "Years of experience must be a whole number between 0 and 120.");

  const existing = await getTable("users", { email: `eq.${email}` });
  if (existing.length) throw createUserError("USER_ALREADY_EXISTS", "An Agrisell user already uses this email address.", 409);

  const authResult = await requestSupabase("/auth/v1/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, email_confirm: true, password, user_metadata: { requested_role: accountType } }),
  }) as Row;
  const authUser = (typeof authResult.user === "object" && authResult.user !== null ? authResult.user : authResult) as Row;
  const authUserId = text(authUser.id);
  if (!authUserId) throw createUserError("USER_CREATION_FAILED", "Supabase did not return the new authentication user.", 502);

  try {
    const applicationUser = (await getTable("users", { email: `eq.${email}` }))[0];
    const userId = id(applicationUser?.user_id);
    if (!userId) throw createUserError("USER_PROFILE_NOT_CREATED", "The authentication account was created, but its Agrisell user profile was not created.", 502);
    const userUpdates: Row = { account_status: "active", first_name: firstName, last_name: lastName };
    setIfPresent(userUpdates, "middle_name", optionalField(body.middleName, 100, "Middle name"));
    setIfPresent(userUpdates, "extension_name", optionalField(body.extensionName, 30, "Extension name"));
    setIfPresent(userUpdates, "contact_number", optionalField(body.contactNumber, 50, "Contact number"));
    setIfPresent(userUpdates, "gender", optionalField(body.gender, 30, "Gender"));
    setIfPresent(userUpdates, "date_of_birth", dateOfBirth || undefined);
    setIfPresent(userUpdates, "e_wallet_details", optionalField(body.eWalletDetails, 500, "E-wallet details"));
    await requestSupabase(`/rest/v1/users?email=eq.${encodeURIComponent(email)}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(userUpdates) });

    if (accountType === "farmer") {
      const farmer: Row = { account_status: "active", auth_user_id: authUserId, farmer_user_id: userId, first_name: firstName, last_name: lastName, registration_date: new Date().toISOString(), verification_status: text(body.verificationStatus).toLowerCase() === "verified" ? "verified" : "pending" };
      setIfPresent(farmer, "middle_name", optionalField(body.middleName, 100, "Middle name"));
      setIfPresent(farmer, "suffix", optionalField(body.extensionName, 30, "Extension name"));
      setIfPresent(farmer, "phone_number", optionalField(body.contactNumber, 50, "Contact number"));
      setIfPresent(farmer, "gender", optionalField(body.gender, 30, "Gender"));
      setIfPresent(farmer, "date_of_birth", dateOfBirth || undefined);
      setIfPresent(farmer, "address_line", optionalField(body.addressLine, 255, "Address"));
      setIfPresent(farmer, "barangay", optionalField(body.barangay, 100, "Barangay"));
      setIfPresent(farmer, "city_municipality", optionalField(body.cityMunicipality, 100, "City or municipality"));
      setIfPresent(farmer, "province", optionalField(body.province, 100, "Province"));
      setIfPresent(farmer, "postal_code", optionalField(body.postalCode, 20, "Postal code"));
      setIfPresent(farmer, "certification", optionalField(body.certification, 255, "Certification"));
      setIfPresent(farmer, "years_of_experience", experienceText ? Number(experienceText) : undefined);
      setIfPresent(farmer, "bank_details", optionalField(body.bankDetails, 500, "Payout details"));
      await requestSupabase("/rest/v1/farmers", { method: "POST", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(farmer) });
    }
    return { accountType, userId };
  } catch (error) {
    await requestSupabase(`/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, { method: "DELETE" }).catch(() => undefined);
    throw error;
  }
};

type Admin = { email: string; permissions: string[]; role: "admin" };

const getAdmin = async (request: Request): Promise<Admin | null> => {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return null;
  const accessToken = authorization.slice(7).trim();
  if (!accessToken) return null;

  const authResult = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${accessToken}` },
  });
  const authUser = await authResult.json().catch(() => null) as Row | null;
  const email = text(authUser?.email).toLowerCase();
  if (!authResult.ok || !email) return null;

  const users = await getTable("users", { email: `eq.${email}` });
  const userId = id(users[0]?.user_id);
  if (!userId) return null;
  const admins = await getTable("admins", { user_id: `eq.${userId}` });
  const role = text(admins[0]?.admin_role).toLowerCase();
  if (role !== "admin" && role !== "super_admin") return null;

  return {
    email,
    permissions: role === "super_admin" ? ["admin:read", "admin:write", "admin:manage"] : ["admin:read", "admin:write"],
    role: "admin",
  };
};

const getDashboard = async () => {
  const tableNames = ["users", "admins", "buyers", "farmers", "farms", "categories", "commodities", "orders", "payments", "reviews", "deliveries", "logistics_companies", "riders"];
  const tableEntries = await Promise.all(tableNames.map(async (table) => [table, await getTable(table)] as const));
  const tables = Object.fromEntries(tableEntries) as Record<string, Row[]>;
  const users = tables.users;
  const farmers = tables.farmers;
  const farms = tables.farms;
  const companies = tables.logistics_companies;
  const riders = tables.riders;
  const usersById = indexBy(users, "user_id");
  const buyersByUserId = indexBy(tables.buyers, "user_id");
  const companiesById = indexBy(companies, "logistics_company_id");
  const farmsById = indexBy(farms, "farm_id");
  const categoriesById = indexBy(tables.categories, "category_id");
  const farmersByUserId = indexBy(farmers, "farmer_user_id");
  const commoditiesByFarm = new Map<string, Row[]>();
  tables.commodities.forEach((commodity) => {
    const farmId = id(commodity.farm_id);
    commoditiesByFarm.set(farmId, [...(commoditiesByFarm.get(farmId) ?? []), commodity]);
  });
  const riderRecord = (rider: Row) => {
    const company = companiesById.get(id(rider.logistics_company_id ?? rider.company_id));
    const status = display(rider.availability_status ?? rider.employment_status, "Pending");
    const employmentStatus = display(rider.employment_status, "Pending approval");
    const deliveries = number(rider.total_deliveries);
    return {
      approvalStatus: employmentStatus === "Active" ? "Approved" : employmentStatus,
      approvalTone: tone(employmentStatus),
      category: company ? text(company.company_name, "Logistics company") : "Logistics company not recorded",
      entityId: id(rider.rider_id),
      primary: name(rider, `Rider ${id(rider.rider_id)}`),
      secondary: text(rider.email ?? rider.contact_number, "Contact not recorded"),
      status, tone: tone(status),
      value: `${display(rider.vehicle_type, "Vehicle not recorded")} · ${deliveries} ${deliveries === 1 ? "delivery" : "deliveries"}`,
    };
  };
  const farmerRecords = farmers.map((farmer) => {
    const user = usersById.get(id(farmer.farmer_user_id));
    const status = display(farmer.verification_status, "Pending");
    return { entityId: id(farmer.farmer_user_id), primary: user ? name(user, "Farmer") : `Farmer ${id(farmer.farmer_user_id)}`, secondary: user ? text(user.email, "Email not recorded") : "User profile not recorded", category: display(farmer.specialty ?? farmer.farming_type, "Farmer"), value: `${farms.filter((farm) => id(farm.farmer_user_id) === id(farmer.farmer_user_id)).length} farms registered`, status, tone: tone(status) };
  });
  const farmerFarms = farms.map((farm) => {
    const linkedCommodities = commoditiesByFarm.get(id(farm.farm_id)) ?? [];
    const status = display(farm.farm_status ?? farm.status, "Active");
    return { id: id(farm.farm_id), farmerId: id(farm.farmer_user_id), farmName: text(farm.farm_name, `Farm ${id(farm.farm_id)}`), farmLocation: text(farm.farm_location ?? farm.location, "Location not set"), farmSizeHectares: number(farm.farm_size_hectares ?? farm.farm_size), farmingType: display(farm.farming_type, "Not specified"), soilType: display(farm.soil_type, "Not specified"), irrigationType: display(farm.irrigation_type, "Not specified"), mainCrops: Array.isArray(farm.main_crops) ? farm.main_crops : [], certifications: Array.isArray(farm.certifications) ? farm.certifications : [], commodities: linkedCommodities.map((commodity) => text(commodity.commodity_name, "Unnamed commodity")), farmImages: [], gpsLat: number(farm.gps_latitude ?? farm.latitude), gpsLong: number(farm.gps_longitude ?? farm.longitude), totalCrops: linkedCommodities.length, status, tone: tone(status) };
  });
  const entityRows: Record<string, unknown[]> = {
    Users: users.map((user) => ({ category: display(user.account_role, "User"), primary: name(user, `User ${id(user.user_id)}`), secondary: text(user.email, "Email not recorded"), value: `Joined ${date(user.created_at)}`, status: display(user.account_status, "Pending"), tone: tone(user.account_status) })),
    Farmers: farmerRecords,
    Farms: farmerFarms.map((farm) => ({ category: farm.farmingType, entityId: farm.id, gpsLat: farm.gpsLat, gpsLong: farm.gpsLong, primary: farm.farmName, secondary: farm.farmLocation, status: farm.status, tone: farm.tone, value: `${farm.farmSizeHectares} hectares` })),
    Commodities: tables.commodities.map((commodity) => { const status = display(commodity.commodity_status, "Available"); const farm = farmsById.get(id(commodity.farm_id)); const category = categoriesById.get(id(commodity.category_id)); return { category: category ? text(category.category_name, "Uncategorized") : "Uncategorized", primary: text(commodity.commodity_name, `Commodity ${id(commodity.commodity_id)}`), secondary: farm ? text(farm.farm_name, "Farm not named") : "Farm not recorded", value: `${money(commodity.price_per_unit)} / ${text(commodity.unit_type, "unit")}`, status, tone: tone(status) }; }),
    "Logistics Companies": riders.map(riderRecord),
    Riders: riders.map(riderRecord),
    Deliveries: tables.deliveries.map((delivery) => { const status = display(delivery.delivery_status, "Pending"); return { category: `Order #AG-${id(delivery.order_id)}`, primary: `Delivery ${id(delivery.delivery_id)}`, secondary: text(delivery.dropoff_location, "Drop-off location not set"), value: `ETA: ${date(delivery.estimated_delivery_time)}`, status, tone: tone(status) }; }),
    Payments: tables.payments.map((payment) => { const status = display(payment.collection_status ?? payment.payment_status, "Pending"); return { category: display(payment.payment_method, "Not set"), primary: `Payment ${id(payment.payment_id)}`, secondary: `Order #AG-${id(payment.order_id)}`, value: money(payment.amount), status, tone: tone(status) }; }),
    Reviews: tables.reviews.map((review) => ({ category: `Order #AG-${id(review.order_id)}`, primary: `Review ${id(review.review_id)}`, secondary: text(review.comment, "No written review"), value: `${number(review.rating)} / 5 rating`, status: "Published", tone: "green" })),
  };
  const orders = tables.orders.map((order) => { const status = display(order.order_status ?? order.payment_status, "Pending"); return { customer: "Customer not recorded", id: `AG-${id(order.order_id)}`, initial: "AG", item: "Order item not recorded", qty: "Not recorded", status, time: date(order.order_date ?? order.created_at), tone: tone(status), total: money(order.total_amount) }; });
  const payments = tables.payments.map((payment) => { const status = display(payment.collection_status ?? payment.payment_status, "Pending"); return { amount: money(payment.amount), amountValue: number(payment.amount), customer: "Customer not recorded", fee: "Not recorded", id: `PY-${id(payment.payment_id)}`, method: display(payment.payment_method, "Not set"), net: money(payment.amount_received ?? payment.amount), order: `Order #AG-${id(payment.order_id)}`, paidAt: date(payment.payment_date ?? payment.created_at), settlement: status === "Completed" ? "Ready" : "Confirming", status: status === "Completed" ? "Completed" : status === "Failed" ? "Failed" : "Pending", time: date(payment.payment_date ?? payment.created_at), tone: tone(status) }; });
  const completedPayments = payments.filter((payment) => payment.status === "Completed");
  const userRows = users.map((user) => {
    const buyer = buyersByUserId.get(id(user.user_id));
    const role = display(user.account_role, buyer ? "Buyer" : "User");
    return {
      accountStatus: display(user.account_status, "Pending") === "Inactive" ? "Inactive" : "Active",
      businessName: text(buyer?.business_name),
      buyerUserId: id(buyer?.buyer_user_id),
      contactNumber: text(user.contact_number, "Not provided"),
      createdAt: date(user.created_at),
      dateOfBirth: text(user.date_of_birth, "Not recorded"),
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
      userType: ["Admin", "Buyer", "Farmer", "Rider"].includes(role) ? role : "User",
    };
  });
  return { entityRows, farmerFarms, farmers: farmerRecords, orders, payments, users: userRows, overview: { activeFarmers: farmerRecords.filter((farmer) => farmer.status === "Verified").length, activeListings: tables.commodities.filter((commodity) => !/(sold|archived|inactive)/i.test(text(commodity.commodity_status))).length, commodityMix: [], deliveryStatuses: [], lowStock: tables.commodities.filter((commodity) => number(commodity.available_quantity, Infinity) <= 5).length, paymentActivityBars: [0, 0, 0, 0, 0, 0, 0], totalOrders: orders.length, totalSales: completedPayments.reduce((total, payment) => total + payment.amountValue, 0) } };
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders(request), status: 204 });
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) return response(request, 503, { code: "DATABASE_NOT_CONFIGURED", message: "The admin database is not configured." });
  try {
    const pathname = new URL(request.url).pathname.replace(/^.*\/admin-api/, "");
    const admin = await getAdmin(request);
    if (request.method === "GET" && pathname === "/api/auth/session") {
      return response(request, 200, admin ? { admin, authenticated: true } : { authenticated: false });
    }
    if (request.method === "POST" && pathname === "/api/auth/logout") return response(request, 200, { authenticated: false });
    if (!admin) return response(request, 401, { code: "AUTHENTICATION_REQUIRED", message: "A valid admin session is required." });
    if (request.method === "GET" && pathname === "/api/admin/dashboard") return response(request, 200, await getDashboard());
    if (request.method === "POST" && pathname === "/api/admin/users") {
      const user = await createDashboardUser(await request.json().catch(() => null));
      return response(request, 201, { user });
    }
    const approval = pathname.match(/^\/api\/admin\/farmers\/([^/]+)\/approval$/);
    if (request.method === "PATCH" && approval) {
      const farmerId = decodeURIComponent(approval[1]);
      const updated = await requestSupabase(`/rest/v1/farmers?farmer_user_id=eq.${encodeURIComponent(farmerId)}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ verification_status: "verified" }) });
      if (!rows(updated).length) return response(request, 404, { code: "FARMER_NOT_FOUND", message: "The farmer profile could not be found." });
      return response(request, 200, { farmer: rows(updated)[0] });
    }
    const riderApproval = pathname.match(/^\/api\/admin\/riders\/([^/]+)\/approval$/);
    if (request.method === "PATCH" && riderApproval) {
      const riderId = decodeURIComponent(riderApproval[1]);
      const updated = await requestSupabase(`/rest/v1/riders?rider_id=eq.${encodeURIComponent(riderId)}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ employment_status: "active" }) });
      if (!rows(updated).length) return response(request, 404, { code: "RIDER_NOT_FOUND", message: "The rider profile could not be found." });
      return response(request, 200, { rider: rows(updated)[0] });
    }
    return response(request, 404, { message: "Route not found." });
  } catch (error) {
    console.error("Agrisell admin API error", error);
    const status = typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : 502;
    const code = text((error as { code?: unknown })?.code, "DATABASE_UNAVAILABLE");
    const message = error instanceof Error && code !== "DATABASE_UNAVAILABLE"
      ? error.message
      : "The admin database could not be reached. Please try again.";
    return response(request, status, { code, message });
  }
});
