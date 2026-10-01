// Defines lifecycle validation primitives and domain errors.
class AccountLifecycleError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

const text = (value, maximum = 1000) =>
  typeof value === 'string' && value.trim().length <= maximum ? value.trim() : '';

const id = (value) => text(String(value ?? '')).replace(/^USR-/i, '');

const USER_STATUSES = new Set(['active', 'suspended', 'deactivated']);
const VERIFICATION_ACTIONS = new Set([
  'profile_updated', 'verified', 'rejected', 'needs_information',
  'suspended', 'deactivated', 'reactivated',
]);

module.exports = {
  AccountLifecycleError,
  id,
  text,
  USER_STATUSES,
  VERIFICATION_ACTIONS,
};
