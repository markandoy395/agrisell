import { getTable, requestSupabase } from "../repository.ts";
import type { Row } from "../types.ts";
import { createApiError, id, text } from "../value.ts";

const optionalField = (value: unknown, maximum: number, label: string) => {
  const result = text(value);
  if (result.length > maximum) {
    throw createApiError(
      "INVALID_USER_PAYLOAD", `${label} must be ${maximum} characters or fewer.`,
    );
  }
  return result || undefined;
};

const setIfPresent = (target: Row, field: string, value: unknown) => {
  if (value !== undefined) target[field] = value;
};

export const createDashboardUser = async (payload: unknown) => {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw createApiError("INVALID_USER_PAYLOAD", "Enter the new user details.");
  }
  const body = payload as Row;
  const accountType = text(body.accountType).toLowerCase();
  const email = text(body.email).toLowerCase();
  const password = typeof body.password === "string" ? body.password : "";
  const firstName = optionalField(body.firstName, 100, "First name");
  const lastName = optionalField(body.lastName, 100, "Last name");
  const dateOfBirth = text(body.dateOfBirth);
  const experienceText = text(body.yearsOfExperience);
  if (!['user', 'farmer'].includes(accountType)) {
    throw createApiError("INVALID_USER_PAYLOAD", "Choose a valid account type.");
  }
  if (!firstName || !lastName) {
    throw createApiError("INVALID_USER_PAYLOAD", "First and last names are required.");
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw createApiError("INVALID_USER_PAYLOAD", "Enter a valid email address.");
  }
  if (password.length < 8 || password.length > 512) {
    throw createApiError(
      "INVALID_USER_PAYLOAD", "Password must be between 8 and 512 characters.",
    );
  }
  if (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    throw createApiError("INVALID_USER_PAYLOAD", "Enter a valid date of birth.");
  }
  if (experienceText && (!/^\d+$/.test(experienceText) || Number(experienceText) > 120)) {
    throw createApiError(
      "INVALID_USER_PAYLOAD", "Years of experience must be a whole number between 0 and 120.",
    );
  }
  if ((await getTable("users", { email: `eq.${email}` })).length) {
    throw createApiError(
      "USER_ALREADY_EXISTS", "An Agrisell user already uses this email address.", 409,
    );
  }
  const authResult = await requestSupabase("/auth/v1/admin/users", {
    body: JSON.stringify({
      email, email_confirm: true, password,
      user_metadata: { requested_role: accountType },
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  }) as Row;
  const authUser = (typeof authResult.user === "object" && authResult.user !== null
    ? authResult.user : authResult) as Row;
  const authUserId = text(authUser.id);
  if (!authUserId) {
    throw createApiError(
      "USER_CREATION_FAILED", "Supabase did not return the new authentication user.", 502,
    );
  }
  try {
    const applicationUser = (await getTable("users", { email: `eq.${email}` }))[0];
    const userId = id(applicationUser?.user_id);
    if (!userId) {
      throw createApiError(
        "USER_PROFILE_NOT_CREATED",
        "The authentication account was created, but its Agrisell user profile was not created.",
        502,
      );
    }
    const userUpdates: Row = {
      account_status: "active", first_name: firstName, last_name: lastName,
    };
    setIfPresent(userUpdates, "middle_name", optionalField(body.middleName, 100, "Middle name"));
    setIfPresent(userUpdates, "extension_name", optionalField(body.extensionName, 30, "Extension name"));
    setIfPresent(userUpdates, "contact_number", optionalField(body.contactNumber, 50, "Contact number"));
    setIfPresent(userUpdates, "gender", optionalField(body.gender, 30, "Gender"));
    setIfPresent(userUpdates, "date_of_birth", dateOfBirth || undefined);
    setIfPresent(userUpdates, "e_wallet_details", optionalField(body.eWalletDetails, 500, "E-wallet details"));
    await requestSupabase(`/rest/v1/users?email=eq.${encodeURIComponent(email)}`, {
      body: JSON.stringify(userUpdates),
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      method: "PATCH",
    });
    if (accountType === "farmer") {
      const farmer: Row = {
        account_status: "active", auth_user_id: authUserId, farmer_user_id: userId,
        first_name: firstName, last_name: lastName,
        registration_date: new Date().toISOString(),
        verification_status: text(body.verificationStatus).toLowerCase() === "verified"
          ? "verified" : "pending",
      };
      const fields: [string, unknown, number, string][] = [
        ["middle_name", body.middleName, 100, "Middle name"],
        ["suffix", body.extensionName, 30, "Extension name"],
        ["phone_number", body.contactNumber, 50, "Contact number"],
        ["gender", body.gender, 30, "Gender"],
        ["address_line", body.addressLine, 255, "Address"],
        ["barangay", body.barangay, 100, "Barangay"],
        ["city_municipality", body.cityMunicipality, 100, "City or municipality"],
        ["province", body.province, 100, "Province"],
        ["postal_code", body.postalCode, 20, "Postal code"],
        ["certification", body.certification, 255, "Certification"],
        ["bank_details", body.bankDetails, 500, "Payout details"],
      ];
      fields.forEach(([field, value, maximum, label]) =>
        setIfPresent(farmer, field, optionalField(value, maximum, label)));
      setIfPresent(farmer, "date_of_birth", dateOfBirth || undefined);
      setIfPresent(farmer, "years_of_experience", experienceText ? Number(experienceText) : undefined);
      await requestSupabase("/rest/v1/farmers", {
        body: JSON.stringify(farmer),
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        method: "POST",
      });
    }
    return { accountType, userId };
  } catch (error) {
    await requestSupabase(`/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, {
      method: "DELETE",
    }).catch(() => undefined);
    throw error;
  }
};
