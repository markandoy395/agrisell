import { SERVICE_ROLE_KEY, SUPABASE_URL } from "../config.ts";
import { requestSupabase, updateRows } from "../repository.ts";
import type { Admin, Row } from "../types.ts";
import { createApiError, name, text } from "../value.ts";
import { processProfileImage } from "./profileImage.ts";

const BUCKET = "admin-profile-images-private";
const SIGNED_URL_TTL_SECONDS = 8 * 60 * 60;

export const signProfileImage = async (storedValue: unknown) => {
  const value = text(storedValue);
  if (!value || !value.startsWith(`${BUCKET}/`)) return value;
  const path = value.slice(BUCKET.length + 1);
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const signed = await requestSupabase(`/storage/v1/object/sign/${BUCKET}/${encoded}`, {
    body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SECONDS }),
    headers: { "Content-Type": "application/json" }, method: "POST",
  }) as Row;
  const signedPath = text(signed.signedURL ?? signed.signedUrl);
  return signedPath.startsWith("/object/sign/")
    ? `${SUPABASE_URL}/storage/v1${signedPath}` : signedPath;
};

const uploadProfileImage = async (userId: string, dataUrl: string) => {
  const binary = await processProfileImage(dataUrl);
  const headers = { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` };
  const bucket = await fetch(`${SUPABASE_URL}/storage/v1/bucket/${BUCKET}`, { headers });
  if ([400, 404].includes(bucket.status)) {
    const created = await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
      body: JSON.stringify({
        allowed_mime_types: ["image/webp"], file_size_limit: 500_000,
        id: BUCKET, name: BUCKET, public: false,
      }),
      headers: { ...headers, "Content-Type": "application/json" },
      method: "POST",
    });
    if (!created.ok && created.status !== 409) {
      throw createApiError(
        "PROFILE_IMAGE_STORAGE_FAILED",
        "The profile image storage bucket could not be created.", 502,
      );
    }
  } else if (!bucket.ok) {
    throw createApiError(
      "PROFILE_IMAGE_STORAGE_FAILED",
      "The profile image storage bucket could not be accessed.", 502,
    );
  }
  const objectPath = `${encodeURIComponent(userId)}/avatar.webp`;
  await requestSupabase(`/storage/v1/object/${BUCKET}/${objectPath}`, {
    body: binary,
    headers: { "Content-Type": "image/webp", "x-upsert": "true" },
    method: "POST",
  });
  return `${BUCKET}/${objectPath}`;
};

export const updateAdminProfile = async (payload: unknown, admin: Admin) => {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw createApiError("INVALID_ADMIN_PROFILE", "Enter valid profile information.");
  }
  const body = payload as Row;
  const profileName = text(body.name).replace(/\s+/g, " ");
  const avatarUrl = text(body.avatarUrl);
  if (!profileName || profileName.length > 200) {
    throw createApiError("INVALID_ADMIN_PROFILE", "Enter a valid profile name.");
  }
  const parts = profileName.split(" ");
  const lastName = parts.length > 1 ? parts.pop() ?? "" : "";
  const updates: Row = {
    extension_name: null, first_name: parts.join(" ") || profileName,
    last_name: lastName, middle_name: null,
  };
  if (avatarUrl) updates.profile_photo_url = await uploadProfileImage(admin.userId, avatarUrl);
  const user = (await updateRows(
    "users", `user_id=eq.${encodeURIComponent(admin.userId)}`, updates,
  ))[0];
  if (!user) {
    throw createApiError(
      "ADMIN_PROFILE_NOT_FOUND", "The administrator profile could not be found.", 404,
    );
  }
  return {
    avatarUrl: await signProfileImage(user.profile_photo_url),
    email: text(user.email, admin.email),
    name: name(user, profileName),
  };
};
