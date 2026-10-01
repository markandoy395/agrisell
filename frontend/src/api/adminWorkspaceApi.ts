import { ApiRequestError, requestAdminApi } from './adminAuth'
import { getString, isRecord } from './adminDataValue'

export type CreateAdministratorInput = {
  email: string
  firstName: string
  lastName: string
  password: string
  permissions: string[]
}

export const createAdministrator = async (input: CreateAdministratorInput) => {
  await requestAdminApi('/api/admin/administrators', {
    body: JSON.stringify(input),
    method: 'POST',
  })
}

export const updateAdministratorPrivileges = async (userId: string, permissions: string[]) => {
  await requestAdminApi(`/api/admin/administrators/${encodeURIComponent(userId)}/privileges`, {
    body: JSON.stringify({ permissions }),
    method: 'PATCH',
  })
}

export type UpdateAdminProfileInput = { avatarUrl?: string; name: string }

export const updateAdminProfile = async (input: UpdateAdminProfileInput) => {
  const body = await requestAdminApi('/api/admin/profile', {
    body: JSON.stringify(input),
    method: 'PATCH',
  })
  const profile = isRecord(body) && isRecord(body.profile) ? body.profile : null
  if (!profile || typeof profile.name !== 'string' || typeof profile.email !== 'string') {
    throw new ApiRequestError('The server returned an invalid profile.', 500)
  }
  return {
    avatarUrl: getString(profile.avatarUrl) || undefined,
    email: profile.email,
    name: profile.name,
  }
}

export type AdminPreferences = { autoApprove: boolean; digest: boolean }

export const getAdminPreferences = async (): Promise<AdminPreferences> => {
  const body = await requestAdminApi('/api/admin/preferences')
  if (
    !isRecord(body) ||
    typeof body.autoApprove !== 'boolean' ||
    typeof body.digest !== 'boolean'
  ) {
    throw new ApiRequestError('The server returned invalid workspace preferences.', 500)
  }
  return { autoApprove: body.autoApprove, digest: body.digest }
}

export const saveAdminPreferences = async (preferences: AdminPreferences) => {
  await requestAdminApi('/api/admin/preferences', {
    body: JSON.stringify(preferences),
    method: 'PUT',
  })
}

export const createAdminRecord = async (section: string, name: string) => {
  await requestAdminApi('/api/admin/records', {
    body: JSON.stringify({ name, section }),
    method: 'POST',
  })
}
