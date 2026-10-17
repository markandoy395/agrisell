const DEFAULT_API_BASE_URL = 'http://localhost:3001'
const EDGE_AUTH_STORAGE_KEY = 'agrisell-admin-edge-session'

const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/+$/, '')
export const usesSupabaseEdgeAuth =
  import.meta.env.VITE_AUTH_MODE === 'edge' ||
  /supabase\.co|\/functions\/v1|\/admin-api/i.test(configuredApiBaseUrl)

type EdgeAuthSession = { accessToken: string }

export class ApiRequestError extends Error {
  code?: string
  status: number

  constructor(message: string, status: number, code?: string) {
    super(message)
    this.name = 'ApiRequestError'
    this.status = status
    this.code = code
  }
}

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const getEdgeAuthSession = (): EdgeAuthSession | null => {
  if (!usesSupabaseEdgeAuth) return null
  try {
    const value = sessionStorage.getItem(EDGE_AUTH_STORAGE_KEY)
    const parsed = value ? (JSON.parse(value) as unknown) : null
    return isRecord(parsed) && typeof parsed.accessToken === 'string'
      ? { accessToken: parsed.accessToken }
      : null
  } catch {
    return null
  }
}

export const saveEdgeAuthSession = (accessToken: string) => {
  sessionStorage.setItem(EDGE_AUTH_STORAGE_KEY, JSON.stringify({ accessToken }))
}

export const clearEdgeAuthSession = () => sessionStorage.removeItem(EDGE_AUTH_STORAGE_KEY)

export const parseJsonResponse = async (response: Response): Promise<unknown> => {
  const text = await response.text()
  if (!text) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

export const getResponseMessage = (body: unknown, fallback: string) =>
  isRecord(body) && typeof body.message === 'string' ? body.message : fallback

export const getResponseCode = (body: unknown) =>
  isRecord(body) && typeof body.code === 'string' ? body.code : undefined

export const getAdminApiUrl = (path: string) => {
  const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL).replace(/\/+$/, '')
  return `${baseUrl}${path}`
}

export const requestAdminApi = async (
  path: string,
  options: RequestInit = {},
): Promise<unknown> => {
  const headers = new Headers(options.headers)
  const edgeSession = getEdgeAuthSession()
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (edgeSession && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${edgeSession.accessToken}`)
  }
  const response = await fetch(getAdminApiUrl(path), {
    ...options,
    credentials: usesSupabaseEdgeAuth ? 'omit' : 'include',
    headers,
  })
  const body = await parseJsonResponse(response)
  if (!response.ok) {
    throw new ApiRequestError(
      getResponseMessage(body, 'The server could not complete the request.'),
      response.status,
      getResponseCode(body),
    )
  }
  return body
}
