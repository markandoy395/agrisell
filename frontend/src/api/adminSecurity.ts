import {
  ApiRequestError,
  getEdgeAuthSession,
  getResponseCode,
  getResponseMessage,
  isRecord,
  parseJsonResponse,
  requestAdminApi,
  saveEdgeAuthSession,
  SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_URL,
  usesSupabaseEdgeAuth,
} from './adminApiClient'

export type SecurityEvent = {
  action: string
  actorEmail: string
  createdAt: string
  detail: string
  id: string
}

export type AdminSessionRecord = {
  current: boolean
  expiresAt: string
  id: string
  issuedAt: string
}

export type SecurityOverview = {
  events: SecurityEvent[]
  mfaAvailable: boolean
  mfaEnabled: boolean
  mfaFactorId?: string
  sessions: AdminSessionRecord[]
}

export const getSecurityOverview = async (): Promise<SecurityOverview> => {
  const value = await requestAdminApi('/api/admin/security')
  if (!isRecord(value) || !Array.isArray(value.events) || !Array.isArray(value.sessions)) {
    throw new ApiRequestError('The server returned invalid security information.', 500)
  }
  return {
    events: value.events.flatMap((event) =>
      isRecord(event)
        ? [
            {
              action: String(event.action ?? ''),
              actorEmail: String(event.actorEmail ?? ''),
              createdAt: String(event.createdAt ?? ''),
              detail: String(event.detail ?? ''),
              id: String(event.id ?? ''),
            },
          ]
        : [],
    ),
    mfaAvailable: value.mfaAvailable === true,
    mfaEnabled: value.mfaEnabled === true,
    mfaFactorId: typeof value.mfaFactorId === 'string' ? value.mfaFactorId : undefined,
    sessions: value.sessions.flatMap((session) =>
      isRecord(session)
        ? [
            {
              current: session.current === true,
              expiresAt: String(session.expiresAt ?? ''),
              id: String(session.id ?? ''),
              issuedAt: String(session.issuedAt ?? ''),
            },
          ]
        : [],
    ),
  }
}

export const changeAdminPassword = async (currentPassword: string, newPassword: string) => {
  await requestAdminApi('/api/admin/security/password', {
    body: JSON.stringify({ currentPassword, newPassword }),
    method: 'POST',
  })
}

export const submitAdminRequest = async (
  type: 'support' | 'feature',
  subject: string,
  message: string,
) => {
  await requestAdminApi('/api/admin/requests', {
    body: JSON.stringify({ message, subject, type }),
    method: 'POST',
  })
}

export const setAdministratorEnabled = async (userId: string, enabled: boolean) => {
  await requestAdminApi(`/api/admin/administrators/${encodeURIComponent(userId)}/status`, {
    body: JSON.stringify({ enabled }),
    method: 'PATCH',
  })
}

export const revokeOtherAdminSessions = async () => {
  await requestAdminApi('/api/admin/security/sessions/revoke-others', { method: 'POST' })
}

const mfaRequest = async (path: string, options: RequestInit = {}) => {
  if (!usesSupabaseEdgeAuth) throw new ApiRequestError('MFA requires Supabase authentication.', 409)
  const token = getEdgeAuthSession()?.accessToken
  if (!token) throw new ApiRequestError('Sign in again before changing MFA.', 401)
  const response = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  const body = await parseJsonResponse(response)
  if (!response.ok)
    throw new ApiRequestError(
      getResponseMessage(body, 'MFA could not be updated.'),
      response.status,
      getResponseCode(body),
    )
  return body
}

export const beginMfaEnrollment = async () => {
  const body = await mfaRequest('/factors', {
    body: JSON.stringify({ factor_type: 'totp', friendly_name: 'Agrisell Admin' }),
    method: 'POST',
  })
  if (!isRecord(body) || typeof body.id !== 'string' || !isRecord(body.totp)) {
    throw new ApiRequestError('Supabase returned invalid MFA enrollment details.', 500)
  }
  return {
    factorId: body.id,
    qrCode: typeof body.totp.qr_code === 'string' ? body.totp.qr_code : '',
    secret: typeof body.totp.secret === 'string' ? body.totp.secret : '',
  }
}

export const verifyMfaEnrollment = async (factorId: string, code: string) => {
  const challenge = await mfaRequest(`/factors/${encodeURIComponent(factorId)}/challenge`, {
    body: '{}',
    method: 'POST',
  })
  if (!isRecord(challenge) || typeof challenge.id !== 'string') {
    throw new ApiRequestError('MFA verification challenge could not be created.', 500)
  }
  const verified = await mfaRequest(`/factors/${encodeURIComponent(factorId)}/verify`, {
    body: JSON.stringify({ challenge_id: challenge.id, code }),
    method: 'POST',
  })
  if (isRecord(verified) && typeof verified.access_token === 'string') {
    saveEdgeAuthSession(verified.access_token)
  }
}

export const removeMfaFactor = async (factorId: string) => {
  await mfaRequest(`/factors/${encodeURIComponent(factorId)}`, { method: 'DELETE' })
}
