import {
  ApiRequestError,
  isRecord,
  requestAdminApi,
  saveEdgeAuthSession,
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

export const beginMfaEnrollment = async () => {
  const body = await requestAdminApi('/api/admin/security/mfa/enroll', { method: 'POST' })
  if (!isRecord(body) || typeof body.factorId !== 'string') {
    throw new ApiRequestError('The server returned invalid MFA enrollment details.', 500)
  }
  return {
    factorId: body.factorId,
    qrCode: typeof body.qrCode === 'string' ? body.qrCode : '',
    secret: typeof body.secret === 'string' ? body.secret : '',
  }
}

export const verifyMfaEnrollment = async (factorId: string, code: string) => {
  const verified = await requestAdminApi('/api/admin/security/mfa/verify', {
    body: JSON.stringify({ factorId, code }),
    method: 'POST',
  })
  if (isRecord(verified) && typeof verified.accessToken === 'string') {
    saveEdgeAuthSession(verified.accessToken)
  }
}

export const removeMfaFactor = async (factorId: string) => {
  await requestAdminApi(`/api/admin/security/mfa/factors/${encodeURIComponent(factorId)}`, {
    method: 'DELETE',
  })
}
