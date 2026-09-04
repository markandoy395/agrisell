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
const ADMIN_PERMISSIONS = [
  "overview:view", "users:manage", "farmers:manage", "logistics:manage",
  "orders:manage", "payments:view", "sales:manage", "reviews:manage",
  "settings:manage",
];
const DEFAULT_ADMIN_PERMISSIONS = ["overview:view", "users:manage", "farmers:manage"];

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
const paymentStatus = (value: unknown) => {
  const status = text(value).toLowerCase();
  if (/(complete|paid|success|settled)/.test(status)) return "Completed";
  if (/(fail|cancel|refund|reject)/.test(status)) return "Failed";
  return "Pending";
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
const dateKey = (value: Date) => value.toISOString().slice(0, 10);
const salesTrend = (payments: Row[]) => {
  const days = Array.from({ length: 365 }, (_, index) => {
    const value = new Date();
    value.setUTCHours(0, 0, 0, 0);
    value.setUTCDate(value.getUTCDate() - (364 - index));
    return value;
  });
  const totals = new Map(days.map((day) => [
    dateKey(day),
    { orders: new Set<string>(), revenue: 0 },
  ]));

  payments.forEach((payment) => {
    if (paymentStatus(payment.collection_status ?? payment.payment_status) !== "Completed") return;
    const paidAt = new Date(text(payment.payment_date ?? payment.recorded_at ?? payment.created_at));
    if (Number.isNaN(paidAt.getTime())) return;
    const total = totals.get(dateKey(paidAt));
    if (!total) return;
    total.revenue += number(payment.amount);
    total.orders.add(id(payment.order_id));
  });

  return days.map((day) => {
    const total = totals.get(dateKey(day));
    return {
      date: dateKey(day),
      orders: total?.orders.size ?? 0,
      revenue: total?.revenue ?? 0,
    };
  });
};
const indexBy = (source: Row[], field: string) => new Map(
  source.map((row) => [id(row[field]), row]).filter(([key]) => Boolean(key)),
);

const corsHeaders = (request: Request) => {
  const requestOrigin = request.headers.get("origin") ?? "";
  const permittedOrigin = ALLOWED_ORIGINS.includes(requestOrigin) ? requestOrigin : "";

  return {
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "DELETE, GET, PATCH, POST, OPTIONS",
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
const newestUser = (users: Row[]) => [...users].sort((current, next) =>
  number(next.user_id) - number(current.user_id)
)[0];
const getAuthUserByEmail = async (email: string) => {
  const result = await requestSupabase("/auth/v1/admin/users?per_page=1000") as Row;
  const users = Array.isArray(result?.users) ? result.users : [];
  return users.find((user): user is Row =>
    typeof user === "object" && user !== null &&
    text((user as Row).email).toLowerCase() === email,
  );
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

const PROFILE_IMAGE_BUCKET = "admin-profile-images";
const uploadProfileImage = async (userId: string, dataUrl: string) => {
  const bucketResult = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${PROFILE_IMAGE_BUCKET}`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
  });
  if (bucketResult.status === 400 || bucketResult.status === 404) {
    const createResult = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
      body: JSON.stringify({
        allowed_mime_types: ["image/webp"],
        file_size_limit: 500_000,
        id: PROFILE_IMAGE_BUCKET,
        name: PROFILE_IMAGE_BUCKET,
        public: true,
      }),
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    if (!createResult.ok && createResult.status !== 409) {
      throw createUserError("PROFILE_IMAGE_STORAGE_FAILED", "The profile image storage bucket could not be created.", 502);
    }
  } else if (!bucketResult.ok) {
    throw createUserError("PROFILE_IMAGE_STORAGE_FAILED", "The profile image storage bucket could not be accessed.", 502);
  }

  const binary = Uint8Array.from(atob(dataUrl.slice(dataUrl.indexOf(",") + 1)), (character) => character.charCodeAt(0));
  const objectPath = `${encodeURIComponent(userId)}/avatar.webp`;
  await requestSupabase(`/storage/v1/object/${PROFILE_IMAGE_BUCKET}/${objectPath}`, {
    body: binary,
    headers: { "Content-Type": "image/webp", "x-upsert": "true" },
    method: "POST",
  });
  return `${SUPABASE_URL}/storage/v1/object/public/${PROFILE_IMAGE_BUCKET}/${objectPath}?v=${Date.now()}`;
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

type Admin = { avatarUrl?: string; email: string; name: string; permissions: string[]; role: "admin"; userId: string };

const permissionsFromRole = (role: Row | undefined) => {
  const description = text(role?.description);
  if (!description.toLowerCase().startsWith("privileges:")) return undefined;
  return description
    .slice("privileges:".length)
    .split(",")
    .map((permission) => permission.trim())
    .filter((permission) => ADMIN_PERMISSIONS.includes(permission));
};

const regularAdminPermissions = (permissions: string[] | undefined) => {
  const selectedPermissions = [...new Set(permissions ?? [])]
    .filter((permission) => ADMIN_PERMISSIONS.includes(permission));
  return selectedPermissions.length
    ? selectedPermissions
    : DEFAULT_ADMIN_PERMISSIONS;
};

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
  const roleRecords = await getTable("admin_roles", { user_id: `eq.${userId}` });
  const storedPermissions = Array.isArray(admins[0]?.permissions)
    ? admins[0].permissions.filter((permission): permission is string =>
        typeof permission === "string" && ADMIN_PERMISSIONS.includes(permission))
    : permissionsFromRole(roleRecords[0]);

  return {
    avatarUrl: text(users[0]?.profile_photo_url) || undefined,
    email,
    name: name(users[0], display(email.split("@")[0], "Administrator")),
    permissions: role === "super_admin"
      ? [...ADMIN_PERMISSIONS, "admin:manage"]
      : regularAdminPermissions(storedPermissions),
    role: "admin",
    userId,
  };
};

const updateAdminProfile = async (payload: unknown, admin: Admin) => {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw createUserError("INVALID_ADMIN_PROFILE", "Enter valid profile information.");
  }
  const body = payload as Row;
  const profileName = text(body.name).replace(/\s+/g, " ");
  const avatarUrl = text(body.avatarUrl);
  if (!profileName || profileName.length > 200) {
    throw createUserError("INVALID_ADMIN_PROFILE", "Enter a valid profile name.");
  }
  if (avatarUrl && (
    avatarUrl.length > 650_000 ||
    !/^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/i.test(avatarUrl)
  )) {
    throw createUserError("INVALID_PROFILE_IMAGE", "Choose a valid JPG, PNG, or WEBP profile image.");
  }

  const nameParts = profileName.split(" ");
  const lastName = nameParts.length > 1 ? nameParts.pop() ?? "" : "";
  const updates: Row = {
    extension_name: null,
    first_name: nameParts.join(" ") || profileName,
    last_name: lastName,
    middle_name: null,
  };
  if (avatarUrl) updates.profile_photo_url = await uploadProfileImage(admin.userId, avatarUrl);

  const updated = rows(await requestSupabase(
    `/rest/v1/users?user_id=eq.${encodeURIComponent(admin.userId)}`,
    {
      body: JSON.stringify(updates),
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      method: "PATCH",
    },
  ));
  const user = updated[0];
  if (!user) throw createUserError("ADMIN_PROFILE_NOT_FOUND", "The administrator profile could not be found.", 404);

  return {
    avatarUrl: text(user.profile_photo_url),
    email: text(user.email, admin.email),
    name: name(user, profileName),
  };
};

const createAdministrator = async (payload: unknown, assigningAdmin: Admin) => {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw createUserError("INVALID_ADMIN_PAYLOAD", "Enter the new administrator details.");
  }
  const body = payload as Row;
  const email = text(body.email).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const firstName = optionalField(body.firstName, 100, "First name");
  const lastName = optionalField(body.lastName, 100, "Last name");
  const permissions = Array.isArray(body.permissions)
    ? [...new Set(body.permissions.filter((item): item is string =>
        typeof item === "string" && ADMIN_PERMISSIONS.includes(item)))]
    : [];
  if (!firstName || !lastName) throw createUserError("INVALID_ADMIN_PAYLOAD", "First and last names are required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw createUserError("INVALID_ADMIN_PAYLOAD", "Enter a valid email address.");
  if (password.length < 8 || password.length > 512) throw createUserError("INVALID_ADMIN_PAYLOAD", "Password must be between 8 and 512 characters.");
  if (!permissions.length || permissions.length !== (Array.isArray(body.permissions) ? new Set(body.permissions).size : 0)) {
    throw createUserError("INVALID_ADMIN_PRIVILEGES", "Select at least one valid administrator privilege.");
  }
  let authUser = await getAuthUserByEmail(email);
  const resumedAuthUser = Boolean(authUser);
  if (authUser && text((authUser.user_metadata as Row | undefined)?.requested_role) !== "admin") {
    throw createUserError("ADMIN_ALREADY_EXISTS", "An account already uses this email address.", 409);
  }
  if (!authUser) {
    const authResult = await requestSupabase("/auth/v1/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email, email_confirm: true, password,
        user_metadata: { first_name: firstName, last_name: lastName, requested_role: "admin" },
      }),
    }) as Row;
    authUser = (typeof authResult.user === "object" && authResult.user !== null ? authResult.user : authResult) as Row;
  }
  const authUserId = text(authUser.id);
  if (!authUserId) throw createUserError("ADMIN_CREATION_FAILED", "Supabase did not return the new authentication user.", 502);
  try {
    const applicationUser = newestUser(await getTable("users", { email: `eq.${email}` }));
    const userId = id(applicationUser?.user_id);
    if (!userId) throw createUserError("ADMIN_PROFILE_NOT_CREATED", "The administrator profile was not created.", 502);
    const existingAdmins = await getTable("admins", { user_id: `eq.${userId}` });
    if (existingAdmins.length) throw createUserError("ADMIN_ALREADY_EXISTS", "This administrator account is already configured.", 409);
    if (resumedAuthUser) {
      await requestSupabase(`/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
    }
    await requestSupabase(`/rest/v1/users?user_id=eq.${encodeURIComponent(userId)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_status: "active", first_name: firstName, last_name: lastName }),
    });
    await requestSupabase("/rest/v1/admins", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        admin_code: "AGRI-ADMIN", admin_role: "admin",
        assigned_by_user_id: assigningAdmin.userId, date_assigned: new Date().toISOString(),
        user_id: userId,
      }),
    });
    await requestSupabase("/rest/v1/admin_roles", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: `Privileges: ${permissions.join(", ")}`,
        role_level: 50, role_name: "Administrator", user_id: userId,
      }),
    });
    return { email, permissions, userId };
  } catch (error) {
    await requestSupabase(`/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, { method: "DELETE" }).catch(() => undefined);
    throw error;
  }
};

const updateAdministratorPrivileges = async (userId: string, payload: unknown) => {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw createUserError("INVALID_ADMIN_PRIVILEGES", "Select at least one valid administrator privilege.");
  }
  const body = payload as Row;
  const permissions = Array.isArray(body.permissions)
    ? [...new Set(body.permissions.filter((item): item is string =>
        typeof item === "string" && ADMIN_PERMISSIONS.includes(item)))]
    : [];
  if (!permissions.length || permissions.length !== (Array.isArray(body.permissions) ? new Set(body.permissions).size : 0)) {
    throw createUserError("INVALID_ADMIN_PRIVILEGES", "Select at least one valid administrator privilege.");
  }

  const targetAdmin = (await getTable("admins", { user_id: `eq.${userId}` }))[0];
  const targetRole = text(targetAdmin?.admin_role).toLowerCase();
  if (targetRole === "super_admin") {
    throw createUserError("SUPER_ADMIN_IMMUTABLE", "Superadmin privileges cannot be restricted.", 403);
  }
  if (targetRole !== "admin") {
    throw createUserError("ADMIN_NOT_FOUND", "The administrator account could not be found.", 404);
  }

  const description = `Privileges: ${permissions.join(", ")}`;
  const updatedRoles = rows(await requestSupabase(
    `/rest/v1/admin_roles?user_id=eq.${encodeURIComponent(userId)}`,
    {
      body: JSON.stringify({ description }),
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      method: "PATCH",
    },
  ));
  if (!updatedRoles.length) {
    await requestSupabase("/rest/v1/admin_roles", {
      body: JSON.stringify({ description, role_level: 50, role_name: "Administrator", user_id: userId }),
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      method: "POST",
    });
  }
  return { permissions, userId };
};

type SaleInput = {
  commodityIds: number[];
  discountType: string;
  discountValue: number;
  endsAt: string | null;
  isEnabled: boolean;
  name: string;
  promoteOnHome: boolean;
  startsAt: string | null;
  targetUserGroup: string;
};

const saleError = (message: string, status = 400) =>
  Object.assign(new Error(message), { code: "SALE_INVALID", status });

const normalizeSale = (
  payload: unknown,
  isEnabled = true,
  existingPromoteOnHome = false,
): SaleInput => {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw saleError("Enter the promotion details.");
  }
  const body = payload as Row;
  const saleName = text(body.name);
  const discountType = text(body.discountType);
  const targetUserGroup = text(body.targetUserGroup);
  const promoteOnHome = typeof body.promoteOnHome === "boolean"
    ? body.promoteOnHome
    : existingPromoteOnHome;
  const discountValue = number(body.discountValue, Number.NaN);
  const commodityIds = Array.isArray(body.commodityIds)
    ? [...new Set(body.commodityIds.map((item) => Number(item)).filter((item) => Number.isInteger(item) && item > 0))]
    : [];
  if (!saleName || !["sale_price", "percentage", "amount"].includes(discountType)) {
    throw saleError("Enter a sale name and a valid discount type.");
  }
  if (!["all_users", "new_users_only"].includes(targetUserGroup) || !Number.isFinite(discountValue) || discountValue <= 0) {
    throw saleError("Enter a valid discount and target user group.");
  }
  if (!commodityIds.length) throw saleError("Select at least one product.");
  if (promoteOnHome && commodityIds.length < 2) {
    throw saleError("Home promotion is available only for campaigns with at least two products.");
  }
  const startsAt = text(body.startsAt) || null;
  const endsAt = text(body.endsAt) || null;
  if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
    throw saleError("The end date must be after the start date.");
  }
  return { commodityIds, discountType, discountValue, endsAt, isEnabled, name: saleName, promoteOnHome, startsAt, targetUserGroup };
};

const rangesOverlap = (first: SaleInput, second: Row) => {
  const firstStart = first.startsAt ? new Date(first.startsAt).getTime() : -Infinity;
  const firstEnd = first.endsAt ? new Date(first.endsAt).getTime() : Infinity;
  const secondStart = text(second.starts_at) ? new Date(text(second.starts_at)).getTime() : -Infinity;
  const secondEnd = text(second.ends_at) ? new Date(text(second.ends_at)).getTime() : Infinity;
  return firstStart < secondEnd && secondStart < firstEnd;
};

const validateSale = (
  sale: SaleInput,
  commodities: Row[],
  sales: Row[],
  saleItems: Row[],
  excludeSaleId = "",
) => {
  const selected = commodities.filter((commodity) => sale.commodityIds.includes(number(commodity.commodity_id)));
  if (selected.length !== sale.commodityIds.length) throw saleError("One or more selected products no longer exist.");
  selected.forEach((commodity) => {
    const original = number(commodity.price_per_unit);
    const finalPrice = sale.discountType === "sale_price" ? sale.discountValue
      : sale.discountType === "percentage" ? original * (1 - sale.discountValue / 100)
      : original - sale.discountValue;
    if (!(finalPrice > 0 && finalPrice < original)) {
      throw saleError(`The sale must lower ${text(commodity.commodity_name, "the product")}'s original price.`);
    }
  });
  if (!sale.isEnabled) return;
  const conflict = sales.find((existing) =>
    existing.is_enabled === true && id(existing.sale_id) !== excludeSaleId &&
    rangesOverlap(sale, existing) && saleItems.some((item) =>
      id(item.sale_id) === id(existing.sale_id) && sale.commodityIds.includes(number(item.commodity_id))
    )
  );
  if (conflict) throw saleError(`A selected product already has an overlapping promotion: ${text(conflict.name, "Existing sale")}.`);
};

const getSaleTables = async () => {
  const [sales, saleItems, commodities, categories] = await Promise.all([
    getTable("product_sales"), getTable("product_sale_items"), getTable("commodities"), getTable("categories"),
  ]);
  return { categories, commodities, saleItems, sales };
};

const getSales = async () => {
  const { categories, commodities, saleItems, sales } = await getSaleTables();
  const commodityNames = new Map(commodities.map((commodity) => [id(commodity.commodity_id), text(commodity.commodity_name, "Removed product")]));
  const categoriesById = new Map(categories.map((category) => [id(category.category_id), text(category.category_name, "Uncategorized")]));
  const firstImage = (value: unknown) => {
    if (typeof value === "string") return value.trim();
    if (Array.isArray(value)) return text(value.find((item) => typeof item === "string"));
    return "";
  };
  return {
    products: commodities.filter((commodity) => number(commodity.price_per_unit) > 0).map((commodity) => ({
      category: categoriesById.get(id(commodity.category_id)) ?? "Uncategorized",
      id: id(commodity.commodity_id),
      imageUrl: firstImage(commodity.image_url ?? commodity.commodity_image_url ?? commodity.photo_url ?? commodity.images),
      name: text(commodity.commodity_name, `Commodity ${id(commodity.commodity_id)}`),
      price: number(commodity.price_per_unit),
      stockQuantity: commodity.available_quantity === null || commodity.available_quantity === undefined ? null : number(commodity.available_quantity),
      stockStatus: text(commodity.commodity_status),
      unit: text(commodity.unit_type, "unit"),
    })),
    sales: sales.map((sale) => ({
      discountType: text(sale.discount_type),
      discountValue: number(sale.discount_value),
      endsAt: text(sale.ends_at) || null,
      id: id(sale.sale_id),
      isEnabled: sale.is_enabled === true,
      name: text(sale.name, `Sale ${id(sale.sale_id)}`),
      promoteOnHome: sale.promote_on_home === true,
      products: saleItems.filter((item) => id(item.sale_id) === id(sale.sale_id)).map((item) => ({
        id: id(item.commodity_id),
        name: commodityNames.get(id(item.commodity_id)) ?? "Removed product",
      })),
      startsAt: text(sale.starts_at) || null,
      targetUserGroup: text(sale.target_user_group, "all_users"),
    })),
  };
};

const insertRow = async (table: string, row: Row) => {
  const result = rows(await requestSupabase(`/rest/v1/${table}`, {
    body: JSON.stringify(row),
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    method: "POST",
  }));
  if (!result[0]) throw saleError("The promotion could not be saved.", 502);
  return result[0];
};

const insertRows = async (table: string, records: Row[]) => {
  if (!records.length) return [];
  const result = rows(await requestSupabase(`/rest/v1/${table}`, {
    body: JSON.stringify(records),
    headers: { "Content-Type": "application/json", Prefer: "return=representation" },
    method: "POST",
  }));
  if (result.length !== records.length) {
    throw saleError("Not all selected products could be attached to the promotion.", 502);
  }
  return result;
};

const createSale = async (payload: unknown) => {
  const sale = normalizeSale(payload);
  const { commodities, saleItems, sales } = await getSaleTables();
  validateSale(sale, commodities, sales, saleItems);
  const created = await insertRow("product_sales", {
    discount_type: sale.discountType, discount_value: sale.discountValue,
    ends_at: sale.endsAt, is_enabled: true, name: sale.name, starts_at: sale.startsAt,
    promote_on_home: sale.promoteOnHome,
    target_user_group: sale.targetUserGroup,
  });
  try {
    await insertRows("product_sale_items", sale.commodityIds.map((commodityId) => ({
      commodity_id: commodityId,
      sale_id: created.sale_id,
    })));
  } catch (error) {
    await requestSupabase(`/rest/v1/product_sales?sale_id=eq.${encodeURIComponent(id(created.sale_id))}`, {
      method: "DELETE",
    });
    throw error;
  }
  return created;
};

const updateSale = async (saleId: string, payload: unknown) => {
  const { commodities, saleItems, sales } = await getSaleTables();
  const existing = sales.find((sale) => id(sale.sale_id) === saleId);
  if (!existing) throw saleError("Sale not found.", 404);
  const body = typeof payload === "object" && payload !== null && !Array.isArray(payload) ? payload as Row : {};
  if (typeof body.isEnabled === "boolean" && Object.keys(body).length === 1) {
    if (body.isEnabled) {
      const sale: SaleInput = {
        commodityIds: saleItems.filter((item) => id(item.sale_id) === saleId).map((item) => number(item.commodity_id)),
        discountType: text(existing.discount_type), discountValue: number(existing.discount_value),
        endsAt: text(existing.ends_at) || null, isEnabled: true, name: text(existing.name),
        promoteOnHome: existing.promote_on_home === true,
        startsAt: text(existing.starts_at) || null, targetUserGroup: text(existing.target_user_group),
      };
      validateSale(sale, commodities, sales, saleItems, saleId);
    }
    const updated = rows(await requestSupabase(`/rest/v1/product_sales?sale_id=eq.${encodeURIComponent(saleId)}`, {
      body: JSON.stringify({ is_enabled: body.isEnabled, updated_at: new Date().toISOString() }),
      headers: { "Content-Type": "application/json", Prefer: "return=representation" }, method: "PATCH",
    }));
    if (!updated[0]) throw saleError("Sale not found.", 404);
    return updated[0];
  }
  const sale = normalizeSale(
    body,
    existing.is_enabled === true,
    existing.promote_on_home === true,
  );
  validateSale(sale, commodities, sales, saleItems, saleId);
  const updated = rows(await requestSupabase(`/rest/v1/product_sales?sale_id=eq.${encodeURIComponent(saleId)}`, {
    body: JSON.stringify({ discount_type: sale.discountType, discount_value: sale.discountValue, ends_at: sale.endsAt, name: sale.name, promote_on_home: sale.promoteOnHome, starts_at: sale.startsAt, target_user_group: sale.targetUserGroup, updated_at: new Date().toISOString() }),
    headers: { "Content-Type": "application/json", Prefer: "return=representation" }, method: "PATCH",
  }));
  const currentIds = saleItems.filter((item) => id(item.sale_id) === saleId).map((item) => number(item.commodity_id));
  const addedIds = sale.commodityIds.filter((item) => !currentIds.includes(item));
  await insertRows("product_sale_items", addedIds.map((commodityId) => ({
    commodity_id: commodityId,
    sale_id: number(saleId),
  })));
  const removedIds = currentIds.filter((item) => !sale.commodityIds.includes(item));
  if (removedIds.length) {
    await requestSupabase(`/rest/v1/product_sale_items?sale_id=eq.${encodeURIComponent(saleId)}&commodity_id=in.(${removedIds.join(",")})`, { method: "DELETE", headers: { Prefer: "return=representation" } });
  }
  return updated[0];
};

const getDashboard = async () => {
  const tableNames = ["users", "admins", "admin_roles", "buyers", "farmers", "farms", "categories", "commodities", "carts", "cart_items", "orders", "payments", "reviews", "rider_ratings", "deliveries", "logistics_companies", "riders"];
  const tableEntries = await Promise.all(tableNames.map(async (table) => [table, await getTable(table)] as const));
  const tables = Object.fromEntries(tableEntries) as Record<string, Row[]>;
  const users = tables.users;
  const farmers = tables.farmers;
  const farms = tables.farms;
  const companies = tables.logistics_companies;
  const riders = tables.riders;
  const usersById = indexBy(users, "user_id");
  const adminRolesByUserId = indexBy(tables.admin_roles, "user_id");
  const buyersByUserId = indexBy(tables.buyers, "user_id");
  const buyersById = indexBy(tables.buyers, "buyer_user_id");
  const companiesById = indexBy(companies, "logistics_company_id");
  const farmsById = indexBy(farms, "farm_id");
  const categoriesById = indexBy(tables.categories, "category_id");
  const farmersByUserId = indexBy(farmers, "farmer_user_id");
  const farmersByAuthId = indexBy(farmers, "auth_user_id");
  const ridersById = indexBy(riders, "rider_id");
  const cartsById = indexBy(tables.carts, "cart_id");
  const cartItemsById = indexBy(tables.cart_items, "cart_item_id");
  const ordersById = indexBy(tables.orders, "order_id");
  const deliveriesById = indexBy(tables.deliveries, "delivery_id");
  const buyerName = (buyerId: unknown, fallback = "Buyer") => {
    const buyer = buyersById.get(id(buyerId));
    const user = buyer ? usersById.get(id(buyer.user_id)) : undefined;
    return user ? name(user, fallback) : fallback;
  };
  const orderBuyerName = (orderId: unknown, fallback = "Buyer") => {
    const order = ordersById.get(id(orderId));
    const cartItem = order ? cartItemsById.get(id(order.cart_item_id)) : undefined;
    const cart = cartItem ? cartsById.get(id(cartItem.cart_id)) : undefined;
    return cart ? buyerName(cart.buyer_user_id, fallback) : fallback;
  };
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
  const reviewRows = [
    ...tables.reviews.map((review) => {
      const farmerId = id(review.farmer_user_id);
      const farmer = farmersByUserId.get(farmerId);
      const rating = number(review.rating);
      const comment = text(review.comment, "No written review");
      return {
        category: "Farmer review", comment, entityId: id(review.review_id),
        primary: buyerName(review.buyer_user_id), rating,
        referenceLabel: `Order #AG-${id(review.order_id) || "record"}`,
        reviewDate: text(review.created_at),
        reviewedName: farmer ? name(farmer, `Farmer ${farmerId || "record"}`) : `Farmer ${farmerId || "not recorded"}`,
        reviewedType: "Farmer", secondary: comment, status: "Published", tone: "green",
        value: `${rating} / 5 rating`,
      };
    }),
    ...tables.rider_ratings.map((review) => {
      const deliveryId = id(review.delivery_id);
      const delivery = deliveriesById.get(deliveryId);
      const orderId = id(delivery?.order_id);
      const riderId = id(review.rider_id);
      const rider = ridersById.get(riderId);
      const reviewerRole = text(review.reviewer_role, "Reviewer");
      const reviewerFarmer = farmersByAuthId.get(id(review.reviewer_auth_id));
      const reviewerName = reviewerRole.toLowerCase() === "farmer" && reviewerFarmer
        ? name(reviewerFarmer, "Farmer")
        : orderBuyerName(orderId, display(reviewerRole, "Reviewer"));
      const rating = number(review.rating);
      const comment = text(review.comment, "No written review");
      return {
        category: "Rider review", comment, entityId: id(review.rating_id), primary: reviewerName, rating,
        referenceLabel: orderId ? `Delivery ${deliveryId || "record"} | Order #AG-${orderId}` : `Delivery ${deliveryId || "record"}`,
        reviewDate: text(review.created_at),
        reviewedName: rider ? name(rider, `Rider ${riderId || "record"}`) : `Rider ${riderId || "not recorded"}`,
        reviewedType: "Rider", secondary: comment, status: "Published", tone: "green",
        value: `${rating} / 5 rating`,
      };
    }),
  ].sort((current, next) => next.reviewDate.localeCompare(current.reviewDate));
  const entityRows: Record<string, unknown[]> = {
    Users: users.map((user) => ({ category: display(user.account_role, "User"), primary: name(user, `User ${id(user.user_id)}`), secondary: text(user.email, "Email not recorded"), value: `Joined ${date(user.created_at)}`, status: display(user.account_status, "Pending"), tone: tone(user.account_status) })),
    Farmers: farmerRecords,
    Farms: farmerFarms.map((farm) => ({ category: farm.farmingType, entityId: farm.id, gpsLat: farm.gpsLat, gpsLong: farm.gpsLong, primary: farm.farmName, secondary: farm.farmLocation, status: farm.status, tone: farm.tone, value: `${farm.farmSizeHectares} hectares` })),
    Commodities: tables.commodities.map((commodity) => { const status = display(commodity.commodity_status, "Available"); const farm = farmsById.get(id(commodity.farm_id)); const category = categoriesById.get(id(commodity.category_id)); return { category: category ? text(category.category_name, "Uncategorized") : "Uncategorized", primary: text(commodity.commodity_name, `Commodity ${id(commodity.commodity_id)}`), secondary: farm ? text(farm.farm_name, "Farm not named") : "Farm not recorded", value: `${money(commodity.price_per_unit)} / ${text(commodity.unit_type, "unit")}`, status, tone: tone(status) }; }),
    "Logistics Companies": riders.map(riderRecord),
    Riders: riders.map(riderRecord),
    Deliveries: tables.deliveries.map((delivery) => { const status = display(delivery.delivery_status, "Pending"); return { category: `Order #AG-${id(delivery.order_id)}`, primary: `Delivery ${id(delivery.delivery_id)}`, secondary: text(delivery.dropoff_location, "Drop-off location not set"), value: `ETA: ${date(delivery.estimated_delivery_time)}`, status, tone: tone(status) }; }),
    Payments: tables.payments.map((payment) => { const status = display(payment.collection_status ?? payment.payment_status, "Pending"); return { category: display(payment.payment_method, "Not set"), primary: `Payment ${id(payment.payment_id)}`, secondary: `Order #AG-${id(payment.order_id)}`, value: money(payment.amount), status, tone: tone(status) }; }),
    Reviews: reviewRows,
  };
  const orders = tables.orders.map((order) => { const status = display(order.order_status ?? order.payment_status, "Pending"); return { customer: "Customer not recorded", id: `AG-${id(order.order_id)}`, initial: "AG", item: "Order item not recorded", qty: "Not recorded", status, time: date(order.order_date ?? order.created_at), tone: tone(status), total: money(order.total_amount) }; });
  const payments = tables.payments.map((payment) => { const status = paymentStatus(payment.collection_status ?? payment.payment_status); return { amount: money(payment.amount), amountValue: number(payment.amount), customer: "Customer not recorded", fee: "Not recorded", id: `PY-${id(payment.payment_id)}`, method: display(payment.payment_method, "Not set"), net: money(payment.amount_received ?? payment.amount), order: `Order #AG-${id(payment.order_id)}`, paidAt: date(payment.payment_date ?? payment.created_at), settlement: status === "Completed" ? "Ready" : "Confirming", status, time: date(payment.payment_date ?? payment.created_at), tone: tone(status) }; });
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
  const administrators = tables.admins.flatMap((administrator) => {
    const userId = id(administrator.user_id);
    const role = text(administrator.admin_role).toLowerCase();
    if (!userId || (role !== "admin" && role !== "super_admin")) return [];
    const user = usersById.get(userId);
    const storedPermissions = permissionsFromRole(adminRolesByUserId.get(userId));
    return [{
      email: text(user?.email, "Email not recorded"),
      name: user ? name(user, `Admin ${userId}`) : `Admin ${userId}`,
      permissions: role === "super_admin"
        ? [...ADMIN_PERMISSIONS, "admin:manage"]
        : regularAdminPermissions(storedPermissions),
      role,
      userId,
    }];
  });
  return { administrators, entityRows, farmerFarms, farmers: farmerRecords, orders, payments, users: userRows, overview: { activeFarmers: farmerRecords.filter((farmer) => farmer.status === "Verified").length, activeListings: tables.commodities.filter((commodity) => !/(sold|archived|inactive)/i.test(text(commodity.commodity_status))).length, commodityMix: [], deliveryStatuses: [], lowStock: tables.commodities.filter((commodity) => number(commodity.available_quantity, Infinity) <= 5).length, paymentActivityBars: [0, 0, 0, 0, 0, 0, 0], salesTrend: salesTrend(tables.payments), totalOrders: orders.length, totalSales: completedPayments.reduce((total, payment) => total + payment.amountValue, 0) } };
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
    if (request.method === "PATCH" && pathname === "/api/admin/profile") {
      return response(request, 200, {
        profile: await updateAdminProfile(await request.json().catch(() => null), admin),
      });
    }
    if (request.method === "POST" && pathname === "/api/admin/administrators") {
      if (!admin.permissions.includes("admin:manage")) {
        return response(request, 403, { code: "SUPER_ADMIN_REQUIRED", message: "Only a super administrator can create administrator accounts." });
      }
      return response(request, 201, { admin: await createAdministrator(await request.json().catch(() => null), admin) });
    }
    const administratorPrivilegesRoute = pathname.match(/^\/api\/admin\/administrators\/([^/]+)\/privileges$/);
    if (request.method === "PATCH" && administratorPrivilegesRoute) {
      if (!admin.permissions.includes("admin:manage")) {
        return response(request, 403, { code: "SUPER_ADMIN_REQUIRED", message: "Only a super administrator can update administrator privileges." });
      }
      const userId = decodeURIComponent(administratorPrivilegesRoute[1]);
      return response(request, 200, await updateAdministratorPrivileges(userId, await request.json().catch(() => null)));
    }
    if (request.method === "GET" && pathname === "/api/admin/dashboard") {
      const dashboard = await getDashboard();
      if (!admin.permissions.includes("admin:manage")) dashboard.administrators = [];
      return response(request, 200, dashboard);
    }
    if (request.method === "GET" && pathname === "/api/admin/sales") {
      if (!admin.permissions.includes("sales:manage") && !admin.permissions.includes("admin:manage")) return response(request, 403, { code: "ADMIN_PRIVILEGE_REQUIRED", message: "Your administrator account does not have permission for this action." });
      return response(request, 200, await getSales());
    }
    if (request.method === "POST" && pathname === "/api/admin/sales") {
      if (!admin.permissions.includes("sales:manage") && !admin.permissions.includes("admin:manage")) return response(request, 403, { code: "ADMIN_PRIVILEGE_REQUIRED", message: "Your administrator account does not have permission for this action." });
      return response(request, 201, { sale: await createSale(await request.json().catch(() => null)) });
    }
    const saleRoute = pathname.match(/^\/api\/admin\/sales\/([^/]+)$/);
    if (request.method === "PATCH" && saleRoute) {
      if (!admin.permissions.includes("sales:manage") && !admin.permissions.includes("admin:manage")) return response(request, 403, { code: "ADMIN_PRIVILEGE_REQUIRED", message: "Your administrator account does not have permission for this action." });
      const saleId = decodeURIComponent(saleRoute[1]);
      return response(request, 200, { sale: await updateSale(saleId, await request.json().catch(() => null)) });
    }
    if (request.method === "DELETE" && saleRoute) {
      if (!admin.permissions.includes("sales:manage") && !admin.permissions.includes("admin:manage")) return response(request, 403, { code: "ADMIN_PRIVILEGE_REQUIRED", message: "Your administrator account does not have permission for this action." });
      const saleId = decodeURIComponent(saleRoute[1]);
      const removed = rows(await requestSupabase(`/rest/v1/product_sales?sale_id=eq.${encodeURIComponent(saleId)}`, {
        headers: { Prefer: "return=representation" }, method: "DELETE",
      }));
      if (!removed[0]) throw saleError("Sale not found.", 404);
      return response(request, 200, {});
    }
    if (request.method === "POST" && pathname === "/api/admin/users") {
      if (!admin.permissions.includes("users:manage") && !admin.permissions.includes("admin:manage")) return response(request, 403, { code: "ADMIN_PRIVILEGE_REQUIRED", message: "Your administrator account does not have permission for this action." });
      const user = await createDashboardUser(await request.json().catch(() => null));
      return response(request, 201, { user });
    }
    const approval = pathname.match(/^\/api\/admin\/farmers\/([^/]+)\/approval$/);
    if (request.method === "PATCH" && approval) {
      if (!admin.permissions.includes("farmers:manage") && !admin.permissions.includes("admin:manage")) return response(request, 403, { code: "ADMIN_PRIVILEGE_REQUIRED", message: "Your administrator account does not have permission for this action." });
      const farmerId = decodeURIComponent(approval[1]);
      const updated = await requestSupabase(`/rest/v1/farmers?farmer_user_id=eq.${encodeURIComponent(farmerId)}`, { method: "PATCH", headers: { "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify({ verification_status: "verified" }) });
      if (!rows(updated).length) return response(request, 404, { code: "FARMER_NOT_FOUND", message: "The farmer profile could not be found." });
      return response(request, 200, { farmer: rows(updated)[0] });
    }
    const riderApproval = pathname.match(/^\/api\/admin\/riders\/([^/]+)\/approval$/);
    if (request.method === "PATCH" && riderApproval) {
      if (!admin.permissions.includes("logistics:manage") && !admin.permissions.includes("admin:manage")) return response(request, 403, { code: "ADMIN_PRIVILEGE_REQUIRED", message: "Your administrator account does not have permission for this action." });
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
