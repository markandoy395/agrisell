import assert from 'node:assert/strict'
import test from 'node:test'

globalThis.Deno = {
  env: {
    get: (name) =>
      name === 'ALLOWED_ORIGINS' ? 'https://admin.example.com' : undefined,
  },
}

const { corsHeaders, jsonResponse } =
  await import('../../supabase/functions/admin-api/http.ts')

const requiredSecurityHeaders = {
  'cache-control': 'no-store, max-age=0',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; sandbox",
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-site',
  'permissions-policy': 'camera=(), geolocation=(), microphone=()',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
}

test('Edge JSON responses include non-cacheable browser security headers', async () => {
  const request = new Request('https://api.example.com/admin-api/api/admin/dashboard', {
    headers: { origin: 'https://admin.example.com' },
  })
  const response = jsonResponse(request, 200, { private: true }, {
    'Cache-Control': 'public, max-age=3600',
    'Retry-After': '30',
  })

  for (const [name, value] of Object.entries(requiredSecurityHeaders)) {
    assert.equal(response.headers.get(name), value)
  }
  assert.equal(response.headers.get('access-control-allow-origin'), 'https://admin.example.com')
  assert.equal(response.headers.get('retry-after'), '30')
  assert.deepEqual(await response.json(), { private: true })
})

test('preflight headers are secured and do not authorize an unknown origin', () => {
  const headers = new Headers(corsHeaders(new Request('https://api.example.com', {
    headers: { origin: 'https://attacker.example' },
    method: 'OPTIONS',
  })))

  for (const [name, value] of Object.entries(requiredSecurityHeaders)) {
    assert.equal(headers.get(name), value)
  }
  assert.equal(headers.has('access-control-allow-origin'), false)
})
