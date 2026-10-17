const ROLES = Object.freeze({
  ADMIN: 'admin',
  SUPER_ADMIN: 'super_admin',
  USER: 'user',
  FARMER: 'farmer',
  RIDER: 'rider',
});

const ADMIN_ROLES = Object.freeze(new Set([
  ROLES.ADMIN,
  ROLES.SUPER_ADMIN,
]));

const APP_ROLES = Object.freeze(new Set([
  ROLES.USER,
  ROLES.FARMER,
  ROLES.RIDER,
]));

const ALL_ROLES = Object.freeze(new Set([
  ...ADMIN_ROLES,
  ...APP_ROLES,
]));

const isAdminRole = (role) => {
  if (typeof role !== 'string') return false;
  return ADMIN_ROLES.has(role.trim().toLowerCase());
};

const isUserRole = (role) => {
  if (typeof role !== 'string') return false;
  return role.trim().toLowerCase() === ROLES.USER;
};

const isValidRole = (role) => {
  if (typeof role !== 'string') return false;
  return ALL_ROLES.has(role.trim().toLowerCase());
};

const hasRole = (actor, ...allowedRoles) => {
  if (!actor || typeof actor.role !== 'string') return false;
  const normalized = actor.role.trim().toLowerCase();
  const flattened = allowedRoles.flat().map((r) => String(r).trim().toLowerCase());
  return flattened.includes(normalized);
};

module.exports = {
  ALL_ROLES,
  ADMIN_ROLES,
  APP_ROLES,
  ROLES,
  hasRole,
  isAdminRole,
  isUserRole,
  isValidRole,
};
