const {
  SupabaseRequestError,
  getSupabaseRows,
  insertSupabaseRow,
  requestSupabaseAuth,
  updateSupabaseRows,
} = require('./supabaseService');
const { createSupabaseAuthUser } = require('./supabaseAdminAuthService');

class AdminUserCreationError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

const text = (value) => (typeof value === 'string' ? value.trim() : '');
const optionalText = (value, maximum, field) => {
  const valueText = text(value);

  if (valueText.length > maximum) {
    throw new AdminUserCreationError(
      'INVALID_USER_PAYLOAD',
      `${field} must be ${maximum} characters or fewer.`,
    );
  }

  return valueText || undefined;
};
const addIfSet = (target, key, value) => {
  if (value !== undefined) target[key] = value;
  return target;
};

const getApplicationUser = async (email) => {
  const users = await getSupabaseRows('users', { email: `eq.${email}` });
  return users.length === 1 ? users[0] : null;
};

const validatePayload = (payload) => {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AdminUserCreationError(
      'INVALID_USER_PAYLOAD',
      'Enter the new user details.',
    );
  }

  const accountType = text(payload.accountType).toLowerCase();
  const email = text(payload.email).toLowerCase();
  const password = typeof payload.password === 'string' ? payload.password : '';
  const firstName = optionalText(payload.firstName, 100, 'First name');
  const lastName = optionalText(payload.lastName, 100, 'Last name');

  if (!['user', 'farmer'].includes(accountType)) {
    throw new AdminUserCreationError('INVALID_USER_PAYLOAD', 'Choose a valid account type.');
  }
  if (!firstName || !lastName) {
    throw new AdminUserCreationError('INVALID_USER_PAYLOAD', 'First and last names are required.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new AdminUserCreationError('INVALID_USER_PAYLOAD', 'Enter a valid email address.');
  }
  if (password.length < 8 || password.length > 512) {
    throw new AdminUserCreationError(
      'INVALID_USER_PAYLOAD',
      'Password must be between 8 and 512 characters.',
    );
  }

  const dateOfBirth = text(payload.dateOfBirth);
  if (dateOfBirth && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    throw new AdminUserCreationError('INVALID_USER_PAYLOAD', 'Enter a valid date of birth.');
  }

  const yearsOfExperience = text(payload.yearsOfExperience);
  if (yearsOfExperience && (!/^\d+$/.test(yearsOfExperience) || Number(yearsOfExperience) > 120)) {
    throw new AdminUserCreationError(
      'INVALID_USER_PAYLOAD',
      'Years of experience must be a whole number between 0 and 120.',
    );
  }

  return {
    accountType,
    addressLine: optionalText(payload.addressLine, 255, 'Address'),
    barangay: optionalText(payload.barangay, 100, 'Barangay'),
    bankDetails: optionalText(payload.bankDetails, 500, 'Payout details'),
    certification: optionalText(payload.certification, 255, 'Certification'),
    cityMunicipality: optionalText(payload.cityMunicipality, 100, 'City or municipality'),
    contactNumber: optionalText(payload.contactNumber, 50, 'Contact number'),
    dateOfBirth: dateOfBirth || undefined,
    email,
    eWalletDetails: optionalText(payload.eWalletDetails, 500, 'E-wallet details'),
    extensionName: optionalText(payload.extensionName, 30, 'Extension name'),
    firstName,
    gender: optionalText(payload.gender, 30, 'Gender'),
    lastName,
    middleName: optionalText(payload.middleName, 100, 'Middle name'),
    password,
    postalCode: optionalText(payload.postalCode, 20, 'Postal code'),
    province: optionalText(payload.province, 100, 'Province'),
    verificationStatus: text(payload.verificationStatus).toLowerCase() === 'verified'
      ? 'verified'
      : 'pending',
    yearsOfExperience: yearsOfExperience ? Number(yearsOfExperience) : undefined,
  };
};

const deleteAuthUser = async (authUserId) => {
  if (!authUserId) return;

  try {
    await requestSupabaseAuth(`/auth/v1/admin/users/${encodeURIComponent(authUserId)}`, {
      method: 'DELETE',
    });
  } catch {
    // Preserve the original error. The account can be removed from Supabase Auth manually if needed.
  }
};

const createAdminUser = async (payload) => {
  const input = validatePayload(payload);
  const existingUser = await getApplicationUser(input.email);

  if (existingUser) {
    throw new AdminUserCreationError(
      'USER_ALREADY_EXISTS',
      'An Agrisell user already uses this email address.',
      409,
    );
  }

  let authUser;

  try {
    authUser = await createSupabaseAuthUser({
      email: input.email,
      password: input.password,
      role: input.accountType,
    });
    const user = await getApplicationUser(input.email);

    if (!user || (typeof user.user_id !== 'string' && typeof user.user_id !== 'number')) {
      throw new AdminUserCreationError(
        'USER_PROFILE_NOT_CREATED',
        'The authentication account was created, but its Agrisell user profile was not created.',
        502,
      );
    }

    const userUpdates = { account_status: 'active', first_name: input.firstName, last_name: input.lastName };
    addIfSet(userUpdates, 'middle_name', input.middleName);
    addIfSet(userUpdates, 'extension_name', input.extensionName);
    addIfSet(userUpdates, 'contact_number', input.contactNumber);
    addIfSet(userUpdates, 'gender', input.gender);
    addIfSet(userUpdates, 'date_of_birth', input.dateOfBirth);
    addIfSet(userUpdates, 'e_wallet_details', input.eWalletDetails);
    await updateSupabaseRows('users', { email: `eq.${input.email}` }, userUpdates);

    if (input.accountType === 'farmer') {
      const farmer = {
        account_status: 'active',
        auth_user_id: String(authUser.id),
        farmer_user_id: user.user_id,
        first_name: input.firstName,
        last_name: input.lastName,
        registration_date: new Date().toISOString(),
        verification_status: input.verificationStatus,
      };
      addIfSet(farmer, 'middle_name', input.middleName);
      addIfSet(farmer, 'suffix', input.extensionName);
      addIfSet(farmer, 'phone_number', input.contactNumber);
      addIfSet(farmer, 'gender', input.gender);
      addIfSet(farmer, 'date_of_birth', input.dateOfBirth);
      addIfSet(farmer, 'address_line', input.addressLine);
      addIfSet(farmer, 'barangay', input.barangay);
      addIfSet(farmer, 'city_municipality', input.cityMunicipality);
      addIfSet(farmer, 'province', input.province);
      addIfSet(farmer, 'postal_code', input.postalCode);
      addIfSet(farmer, 'certification', input.certification);
      addIfSet(farmer, 'years_of_experience', input.yearsOfExperience);
      addIfSet(farmer, 'bank_details', input.bankDetails);
      await insertSupabaseRow('farmers', farmer);
    }

    return { accountType: input.accountType, userId: String(user.user_id) };
  } catch (error) {
    await deleteAuthUser(typeof authUser?.id === 'string' ? authUser.id : '');

    if (error instanceof AdminUserCreationError) throw error;
    if (error instanceof SupabaseRequestError && error.status === 409) {
      throw new AdminUserCreationError(
        'USER_ALREADY_EXISTS',
        'An account already uses this email address.',
        409,
      );
    }
    throw error;
  }
};

module.exports = { AdminUserCreationError, createAdminUser };
