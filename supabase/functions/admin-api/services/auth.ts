import {
  ADMIN_PERMISSIONS, DEFAULT_ADMIN_PERMISSIONS, SERVICE_ROLE_KEY, SUPABASE_URL,
} from "../config.ts";
import { getTable } from "../repository.ts";
import type { Admin, Row } from "../types.ts";
import { display, id, name, text } from "../value.ts";
import { signProfileImage } from "./profile.ts";

const permissionsFromRole = (role: Row | undefined) => {
  const description = text(role?.description);
  if (!description.toLowerCase().startsWith("privileges:")) return undefined;
  return description.slice("privileges:".length).split(",")
    .map((permission) => permission.trim())
    .filter((permission) => ADMIN_PERMISSIONS.includes(permission));
};

const regularAdminPermissions = (permissions: string[] | undefined) => {
  const selected = [...new Set(permissions ?? [])]
    .filter((permission) => ADMIN_PERMISSIONS.includes(permission));
  return selected.length ? selected : DEFAULT_ADMIN_PERMISSIONS;
};

const tokenClaims = (accessToken: string) => {
  const value = accessToken.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/") ?? "";
  return JSON.parse(atob(value.padEnd(Math.ceil(value.length / 4) * 4, "="))) as Row;
};

export type AuthenticatedActorResult = {
  status: "unauthenticated" | "authenticated_user" | "authenticated_admin";
  admin: Admin | null;
  actor: { email: string; userId: string; role: string; name: string } | null;
};

export const getAuthenticatedActor = async (request: Request): Promise<AuthenticatedActorResult> => {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) {
    return { status: "unauthenticated", admin: null, actor: null };
  }
  const accessToken = authorization.slice(7).trim();
  if (!accessToken) {
    return { status: "unauthenticated", admin: null, actor: null };
  }

  const authResult = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${accessToken}` },
  });
  const authUser = await authResult.json().catch(() => null) as Row | null;
  const email = text(authUser?.email).toLowerCase();
  if (!authResult.ok || !email) {
    return { status: "unauthenticated", admin: null, actor: null };
  }

  const users = await getTable("users", { email: `eq.${email}` });
  const userId = id(users[0]?.user_id);
  if (!userId || text(users[0]?.account_status).toLowerCase() !== "active") {
    return { status: "unauthenticated", admin: null, actor: null };
  }

  const userName = name(users[0], display(email.split("@")[0], "User"));
  const userRole = text(users[0]?.account_role || users[0]?.role).toLowerCase() || "user";

  const admins = await getTable("admins", { user_id: `eq.${userId}` });
  const role = text(admins[0]?.admin_role).toLowerCase();

  if (!['admin', 'super_admin'].includes(role)) {
    return {
      status: "authenticated_user",
      admin: null,
      actor: { email, userId, role: userRole, name: userName },
    };
  }

  const verifiedFactors = Array.isArray(authUser?.factors)
    ? (authUser.factors as Row[]).some((factor) => text(factor.status) === "verified") : false;
  if (verifiedFactors) {
    try {
      const claims = tokenClaims(accessToken);
      if (text(claims.aal) !== "aal2") {
        return { status: "unauthenticated", admin: null, actor: null };
      }
    } catch {
      return { status: "unauthenticated", admin: null, actor: null };
    }
  }

  const roles = await getTable("admin_roles", { user_id: `eq.${userId}` });
  const stored = Array.isArray(admins[0]?.permissions)
    ? admins[0].permissions.filter((permission): permission is string =>
      typeof permission === "string" && ADMIN_PERMISSIONS.includes(permission))
    : permissionsFromRole(roles[0]);

  const admin: Admin = {
    avatarUrl: await signProfileImage(users[0]?.profile_photo_url) || undefined,
    email,
    name: name(users[0], display(email.split("@")[0], "Administrator")),
    permissions: role === "super_admin"
      ? [...ADMIN_PERMISSIONS, "admin:manage"] : regularAdminPermissions(stored),
    role: "admin",
    userId,
  };

  return {
    status: "authenticated_admin",
    admin,
    actor: { email, userId, role, name: admin.name },
  };
};

export const getAdmin = async (request: Request): Promise<Admin | null> => {
  const result = await getAuthenticatedActor(request);
  return result.admin;
};

export { permissionsFromRole, regularAdminPermissions };
