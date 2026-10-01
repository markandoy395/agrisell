import assert from 'node:assert/strict'
import test from 'node:test'

globalThis.Deno = {
  env: {
    get: (name) =>
      name === 'SUPABASE_URL'
        ? 'https://project.supabase.invalid'
        : name === 'SUPABASE_SERVICE_ROLE_KEY'
          ? 'service-role-test-key'
          : undefined,
  },
}

const { handleAuthRoutes } =
  await import('../../supabase/functions/admin-api/handlers/auth.ts')

test('edge login consumes distributed IP and account limits before authentication', async () => {
  const originalFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input)
    calls.push({ body: init.body ? JSON.parse(String(init.body)) : null, url })
    if (url.endsWith('/rest/v1/rpc/admin_consume_rate_limit')) {
      return new Response(JSON.stringify([{
        allowed: true,
        remaining: 4,
        retry_after_seconds: 0,
      }]), { status: 200 })
    }
    if (url.includes('/auth/v1/token?grant_type=password')) {
      return new Response(JSON.stringify({ message: 'Invalid login credentials' }), { status: 400 })
    }
    if (url.endsWith('/rest/v1/admin_security_events')) {
      return new Response(JSON.stringify([{ event_id: 1 }]), { status: 201 })
    }
    throw new Error(`Unexpected request: ${url}`)
  }
  try {
    const result = await handleAuthRoutes(
      new Request('https://project.supabase.invalid/functions/v1/admin-api/api/auth/login', {
        body: JSON.stringify({ email: 'Admin@Example.com', password: 'incorrect' }),
        headers: {
          'content-type': 'application/json',
          'x-forwarded-for': '198.51.100.20',
        },
        method: 'POST',
      }),
      '/api/auth/login',
    )
    assert.equal(result.status, 401)
    assert.equal(result.body.code, 'INVALID_CREDENTIALS')
    const limiterCalls = calls.filter((call) => call.url.includes('admin_consume_rate_limit'))
    assert.equal(limiterCalls.length, 2)
    assert.deepEqual(limiterCalls.map((call) => call.body.p_scope), [
      'auth:login:ip',
      'auth:login:account',
    ])
    assert.equal(calls.filter((call) => call.url.includes('/auth/v1/token')).length, 1)
    const event = calls.find((call) => call.url.includes('/admin_security_events'))
    assert.equal(event.body.action, 'sign_in_failed')
    assert.equal(event.body.actor_email, 'admin@example.com')
  } finally {
    globalThis.fetch = originalFetch
  }
})
