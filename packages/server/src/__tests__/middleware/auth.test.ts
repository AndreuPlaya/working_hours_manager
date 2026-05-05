import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../infrastructure/settings.js')

import { ensureSecretKey } from '../../infrastructure/settings.js'
import { Hono } from 'hono'
import { SignJWT } from 'jose'
import { authMiddleware, adminMiddleware } from '../../middleware/auth.js'

const mockEnsureKey = vi.mocked(ensureSecretKey)
const TEST_SECRET = 'test-secret-key-for-middleware-tests'

beforeEach(() => {
  vi.resetAllMocks()
  mockEnsureKey.mockReturnValue(TEST_SECRET)
})

async function makeToken(payload: { username: string; isAdmin: boolean; empId: string | null }): Promise<string> {
  const secret = new TextEncoder().encode(TEST_SECRET)
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret)
}

// ---------------------------------------------------------------------------
// authMiddleware
// ---------------------------------------------------------------------------

describe('authMiddleware', () => {
  it('returns 401 when no session cookie is present', async () => {
    const app = new Hono()
    app.use('/test', authMiddleware)
    app.get('/test', c => c.json({ ok: true }))

    const res = await app.request('/test')
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Not authenticated.')
  })

  it('sets the user context and calls next for a valid JWT', async () => {
    const token = await makeToken({ username: 'admin', isAdmin: true, empId: null })
    const app = new Hono()
    app.use('/test', authMiddleware)
    app.get('/test', c => c.json(c.get('user')))

    const res = await app.request('/test', {
      headers: { Cookie: `session=${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.username).toBe('admin')
    expect(body.isAdmin).toBe(true)
    expect(body.empId).toBeNull()
  })

  it('returns 401 for an invalid or expired JWT', async () => {
    const app = new Hono()
    app.use('/test', authMiddleware)
    app.get('/test', c => c.json({ ok: true }))

    const res = await app.request('/test', {
      headers: { Cookie: 'session=invalid-token' },
    })
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Session expired.')
  })
})

// ---------------------------------------------------------------------------
// adminMiddleware
// ---------------------------------------------------------------------------

describe('adminMiddleware', () => {
  it('returns 403 when the user is not an admin', async () => {
    const token = await makeToken({ username: 'employee', isAdmin: false, empId: '1' })
    const app = new Hono()
    app.use('/test', authMiddleware, adminMiddleware)
    app.get('/test', c => c.json({ ok: true }))

    const res = await app.request('/test', {
      headers: { Cookie: `session=${token}` },
    })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.error).toBe('Admin access required.')
  })

  it('calls next when the user is an admin', async () => {
    const token = await makeToken({ username: 'admin', isAdmin: true, empId: null })
    const app = new Hono()
    app.use('/test', authMiddleware, adminMiddleware)
    app.get('/test', c => c.json({ ok: true }))

    const res = await app.request('/test', {
      headers: { Cookie: `session=${token}` },
    })
    expect(res.status).toBe(200)
  })
})
