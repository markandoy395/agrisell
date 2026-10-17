export const ROLES = {
  ADMIN: "admin",
  SUPER_ADMIN: "super_admin",
  USER: "user",
  FARMER: "farmer",
  RIDER: "rider",
} as const;

export type Role = typeof ROLES[keyof typeof ROLES];
export type AdminRole = typeof ROLES.ADMIN | typeof ROLES.SUPER_ADMIN;
export type UserRole = typeof ROLES.USER;

export const ADMIN_ROLES = new Set<string>([ROLES.ADMIN, ROLES.SUPER_ADMIN]);
export const APP_ROLES = new Set<string>([ROLES.USER, ROLES.FARMER, ROLES.RIDER]);
export const ALL_ROLES = new Set<string>([...ADMIN_ROLES, ...APP_ROLES]);

export const isAdminRole = (role: unknown): role is AdminRole => {
  if (typeof role !== "string") return false;
  return ADMIN_ROLES.has(role.trim().toLowerCase());
};

export const isUserRole = (role: unknown): role is UserRole => {
  if (typeof role !== "string") return false;
  return role.trim().toLowerCase() === ROLES.USER;
};

export const isValidRole = (role: unknown): role is Role => {
  if (typeof role !== "string") return false;
  return ALL_ROLES.has(role.trim().toLowerCase());
};

export const hasRole = (
  actor: { role?: unknown } | null | undefined,
  ...allowedRoles: string[]
): boolean => {
  if (!actor || typeof actor.role !== "string") return false;
  const normalized = actor.role.trim().toLowerCase();
  const flattened = allowedRoles.flat().map((r) => r.trim().toLowerCase());
  return flattened.includes(normalized);
};
