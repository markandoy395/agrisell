// Parses and validates administrator verification decisions.
const {
  AccountLifecycleError,
  text,
  VERIFICATION_ACTIONS,
} = require('./adminAccountLifecycleValue');

const EDITABLE_FIELDS = {
  farmer: [
    'first_name', 'middle_name', 'last_name', 'suffix', 'phone_number',
    'address_line', 'barangay', 'city_municipality', 'province', 'postal_code',
    'certification',
  ],
  rider: [
    'first_name', 'middle_name', 'last_name', 'contact_number',
    'complete_address', 'license_number', 'vehicle_type', 'vehicle_plate_number',
  ],
};

const parseDecision = (input) => {
  const action = text(input.action).toLowerCase();
  const reason = text(input.reason, 1000);
  const message = text(input.message, 1000);
  const missingItems = Array.isArray(input.missingItems)
    ? input.missingItems.map((item) => text(item, 100)).filter(Boolean).slice(0, 20)
    : [];
  if (!VERIFICATION_ACTIONS.has(action)) {
    throw new AccountLifecycleError(
      'INVALID_DECISION', 'Choose approve, reject, or request information.',
    );
  }
  if (['rejected', 'suspended', 'deactivated'].includes(action) && !reason) {
    throw new AccountLifecycleError(
      'REASON_REQUIRED', 'A reason is required for this decision.',
    );
  }
  if (action === 'needs_information' && (!message || !missingItems.length)) {
    throw new AccountLifecycleError(
      'MISSING_INFORMATION_REQUIRED',
      'Describe the request and select at least one missing item.',
    );
  }
  return { action, message, missingItems, reason };
};

const getProfileEdits = (entityType, input, profile) => {
  const updates = input.profileUpdates;
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) return {};
  const edits = Object.fromEntries(
    EDITABLE_FIELDS[entityType]
      .filter((field) => Object.hasOwn(updates, field))
      .map((field) => [field, text(updates[field], 255) || null]),
  );
  if (
    (Object.hasOwn(edits, 'first_name') && !edits.first_name) ||
    (Object.hasOwn(edits, 'last_name') && !edits.last_name)
  ) {
    throw new AccountLifecycleError(
      'INVALID_PROFILE', 'First and last name cannot be empty.',
    );
  }
  if (entityType === 'rider' && (
    Object.hasOwn(edits, 'first_name') || Object.hasOwn(edits, 'last_name')
  )) {
    edits.full_name = [
      edits.first_name ?? profile.first_name,
      profile.middle_name,
      edits.last_name ?? profile.last_name,
    ].map((part) => text(part)).filter(Boolean).join(' ');
  }
  return edits;
};

const getStatusUpdates = (entityType, action, profile) => {
  const verificationStatus = ['verified', 'rejected', 'needs_information'].includes(action)
    ? (action === 'needs_information' ? 'pending' : action)
    : profile.verification_status;
  const accountStatus = action === 'verified' || action === 'reactivated' ? 'active'
    : action === 'rejected' ? 'rejected'
      : action === 'needs_information' ? 'pending'
        : ['suspended', 'deactivated'].includes(action) ? action : profile.account_status;
  if (entityType === 'farmer') {
    return { account_status: accountStatus, verification_status: verificationStatus };
  }
  const employmentStatus = action === 'profile_updated' ? profile.employment_status
    : ['verified', 'reactivated'].includes(action) ? 'active'
      : action === 'suspended' ? 'suspended' : 'inactive';
  return {
    availability_status: ['profile_updated', 'verified', 'reactivated'].includes(action)
      ? profile.availability_status : 'offline',
    employment_status: employmentStatus,
    verification_status: verificationStatus,
  };
};

module.exports = { getProfileEdits, getStatusUpdates, parseDecision };
