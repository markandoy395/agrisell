// Persists administrator profile changes.
const {
  getSupabaseRows, signSupabaseProfileImage, updateSupabaseRows, uploadSupabaseProfileImage,
} = require('../../../services/supabaseService');

const saveAdminProfile = async ({ adminEmail, avatarUrl, name }) => {
  const users = await getSupabaseRows('users', { email: `eq.${adminEmail}` });
  const user = users[0];
  if (!user?.user_id) return null;
  const nameParts = name.split(' ');
  const lastName = nameParts.length > 1 ? nameParts.pop() : '';
  const updates = {
    extension_name: null,
    first_name: nameParts.join(' ') || name,
    last_name: lastName,
    middle_name: null,
  };
  if (avatarUrl) {
    updates.profile_photo_url = await uploadSupabaseProfileImage(user.user_id, avatarUrl);
  }
  const updatedUsers = await updateSupabaseRows(
    'users', { user_id: `eq.${user.user_id}` }, updates,
  );
  const updatedUser = updatedUsers[0];
  if (!updatedUser) return null;
  return {
    avatarUrl: await signSupabaseProfileImage(String(updatedUser.profile_photo_url ?? '')),
    email: String(updatedUser.email ?? adminEmail),
    name: [
      updatedUser.first_name, updatedUser.middle_name,
      updatedUser.last_name, updatedUser.extension_name,
    ].map((value) => String(value ?? '').trim()).filter(Boolean).join(' ') || name,
  };
};

module.exports = { saveAdminProfile };
