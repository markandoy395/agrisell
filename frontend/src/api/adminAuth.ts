import {
  ApiRequestError, clearEdgeAuthSession, getAdminApiUrl, getEdgeAuthSession, getResponseCode,
  getResponseMessage, isRecord, parseJsonResponse, requestAdminApi,
  saveEdgeAuthSession, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, usesSupabaseEdgeAuth,
} from './adminApiClient'

export { ApiRequestError, requestAdminApi } from './adminApiClient'

export type LoginCredentials = {
  email: string
  password: string
}

const MFA_CHALLENGE_KEY = 'agrisell-admin-mfa-challenge'

export type AuthenticatedAdmin = {
  avatarUrl?: string
  email: string
  name: string
  role: 'admin'
  permissions: string[]
}

export type AdminSession =
  { admin: AuthenticatedAdmin; authenticated: true } | { authenticated: false }

const parseAdminSession = (body: unknown): AdminSession => {
  if (!isRecord(body) || typeof body.authenticated !== 'boolean') {
    throw new ApiRequestError('The server returned an invalid session.', 500)
  }
  if (!body.authenticated) return { authenticated: false }
  const admin = body.admin
  if (
    !isRecord(admin) ||
    typeof admin.email !== 'string' ||
    admin.role !== 'admin' ||
    !Array.isArray(admin.permissions) ||
    !admin.permissions.every((permission) => typeof permission === 'string')
  ) {
    throw new ApiRequestError('The server returned an invalid admin.', 500)
  }
  return {
    admin: {
      avatarUrl:
        typeof admin.avatarUrl === 'string' && admin.avatarUrl ? admin.avatarUrl : undefined,
      email: admin.email,
      name:
        typeof admin.name === 'string' && admin.name.trim()
          ? admin.name
          : admin.email
              .split('@')[0]
              .replace(/[._-]+/g, ' ')
              .replace(/\b\w/g, (letter) => letter.toUpperCase()),
      permissions: admin.permissions,
      role: admin.role,
    },
    authenticated: true,
  }
}

export const getAdminSession = async () =>
  parseAdminSession(await requestAdminApi('/api/auth/session'))

export const loginAdmin = async (credentials: LoginCredentials) => {
  if (!usesSupabaseEdgeAuth) {
    return parseAdminSession(
      await requestAdminApi('/api/auth/login', {
        body: JSON.stringify(credentials),
        method: 'POST',
      }),
    )
  }
  const loginResponse = await fetch(getAdminApiUrl('/api/auth/login'), {
    body: JSON.stringify(credentials),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })
  const loginBody = await parseJsonResponse(loginResponse)
  if (
    !loginResponse.ok &&
    isRecord(loginBody) &&
    loginBody.code === 'MFA_REQUIRED' &&
    typeof loginBody.accessToken === 'string' &&
    typeof loginBody.challengeId === 'string' &&
    typeof loginBody.factorId === 'string'
  ) {
    sessionStorage.setItem(
      MFA_CHALLENGE_KEY,
      JSON.stringify({
        accessToken: loginBody.accessToken,
        challengeId: loginBody.challengeId,
        factorId: loginBody.factorId,
      }),
    )
    throw new ApiRequestError('Enter the code from your authenticator app.', 401, 'MFA_REQUIRED')
  }
  if (!loginResponse.ok || !isRecord(loginBody) || typeof loginBody.accessToken !== 'string') {
    throw new ApiRequestError(
      getResponseMessage(loginBody, 'Invalid admin email or password.'),
      loginResponse.status || 401,
      getResponseCode(loginBody),
    )
  }
  saveEdgeAuthSession(loginBody.accessToken)
  const session = await getAdminSession()
  if (!session.authenticated) {
    clearEdgeAuthSession()
    throw new ApiRequestError(
      'This account is not authorized to access the admin platform.',
      403,
      'ADMIN_PERMISSION_REQUIRED',
    )
  }
  return session
}

export const completeAdminMfa = async (code: string) => {
  let pending: unknown
  try {
    pending = JSON.parse(sessionStorage.getItem(MFA_CHALLENGE_KEY) ?? 'null') as unknown
  } catch {
    pending = null
  }
  if (
    !isRecord(pending) ||
    typeof pending.accessToken !== 'string' ||
    typeof pending.challengeId !== 'string' ||
    typeof pending.factorId !== 'string'
  ) {
    throw new ApiRequestError('Start the sign-in process again.', 401, 'MFA_CHALLENGE_EXPIRED')
  }
  const response = await fetch(
    `${SUPABASE_URL}/auth/v1/factors/${encodeURIComponent(pending.factorId)}/verify`,
    {
      body: JSON.stringify({ challenge_id: pending.challengeId, code }),
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${pending.accessToken}`,
        'Content-Type': 'application/json',
      },
      method: 'POST',
    },
  )
  const body = await parseJsonResponse(response)
  if (!response.ok || !isRecord(body) || typeof body.access_token !== 'string') {
    throw new ApiRequestError(
      getResponseMessage(body, 'The authentication code is invalid.'),
      response.status || 401,
      getResponseCode(body),
    )
  }
  sessionStorage.removeItem(MFA_CHALLENGE_KEY)
  saveEdgeAuthSession(body.access_token)
  return getAdminSession()
}

export const logoutAdmin = async () => {
  if (!usesSupabaseEdgeAuth) {
    await requestAdminApi('/api/auth/logout', { method: 'POST' })
    return
  }
  const session = getEdgeAuthSession()
  clearEdgeAuthSession()
  if (session) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${session.accessToken}`,
      },
      method: 'POST',
    })
  }
}

export const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof ApiRequestError && error.message) return error.message
  if (error instanceof Error && error.message && error.name !== 'AbortError') return error.message
  return fallback
}
