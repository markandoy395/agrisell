// Manages Supabase storage used by administrator profile images.
const { config } = require('../../../config/environment');
const { processProfileImage } = require('../images/profileImageProcessor');
const { requestSupabase, SupabaseRequestError } = require('./supabaseRequest');

const PROFILE_IMAGE_BUCKET = 'admin-profile-images-private';
const SIGNED_URL_TTL_SECONDS = 8 * 60 * 60;

const ensureProfileImageBucket = async () => {
  try {
    await requestSupabase(
      new URL(`/storage/v1/bucket/${PROFILE_IMAGE_BUCKET}`, config.supabaseUrl),
    );
  } catch (error) {
    if (!(error instanceof SupabaseRequestError) || ![400, 404].includes(error.status)) {
      throw error;
    }
    try {
      await requestSupabase(new URL('/storage/v1/bucket', config.supabaseUrl), {
        body: JSON.stringify({
          allowed_mime_types: ['image/webp'],
          file_size_limit: 500_000,
          id: PROFILE_IMAGE_BUCKET,
          name: PROFILE_IMAGE_BUCKET,
          public: false,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
    } catch (createError) {
      if (!(createError instanceof SupabaseRequestError) || createError.status !== 409) {
        throw createError;
      }
    }
  }
};

const uploadSupabaseProfileImage = async (userId, dataUrl) => {
  const image = await processProfileImage(dataUrl);
  await ensureProfileImageBucket();
  const objectPath = `${encodeURIComponent(String(userId))}/avatar.webp`;
  await requestSupabase(
    new URL(`/storage/v1/object/${PROFILE_IMAGE_BUCKET}/${objectPath}`, config.supabaseUrl),
    {
      body: image,
      headers: { 'Content-Type': 'image/webp', 'x-upsert': 'true' },
      method: 'POST',
    },
  );
  return `${PROFILE_IMAGE_BUCKET}/${objectPath}`;
};

const signSupabaseProfileImage = async (storedValue) => {
  if (typeof storedValue !== 'string' || !storedValue.trim()) return '';
  const value = storedValue.trim();
  if (!value.startsWith(`${PROFILE_IMAGE_BUCKET}/`)) return value;
  const objectPath = value.slice(PROFILE_IMAGE_BUCKET.length + 1);
  const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/');
  const signed = await requestSupabase(
    new URL(`/storage/v1/object/sign/${PROFILE_IMAGE_BUCKET}/${encodedPath}`, config.supabaseUrl),
    {
      body: JSON.stringify({ expiresIn: SIGNED_URL_TTL_SECONDS }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    },
  );
  const signedPath = signed?.signedURL ?? signed?.signedUrl ?? '';
  return typeof signedPath === 'string' && signedPath.startsWith('/object/sign/')
    ? `${config.supabaseUrl.replace(/\/$/, '')}/storage/v1${signedPath}` : signedPath;
};

module.exports = { signSupabaseProfileImage, uploadSupabaseProfileImage };
