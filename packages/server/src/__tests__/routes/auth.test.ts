import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../application/userService.js')
vi.mock('../../infrastructure/settings.js')

import { authenticate, needsSetup, createInitialAdmin } from '../../application/userService.js'
import { ensureSecretKey } from '../../infrastructure/settings.js'
import { SignJWT } from 'jose'
import authRoutes from '../../routes/auth.js'

const mockAuthenticate = vi.mocked(authenticate)
const mockNeedsSetup = vi.mocked(needsSetup)
const mockCreateInitialAdmin = vi.mocked(createInitialAdmin)
const mockEnsureKey = vi.mocked(ensureSecretKey)

const TEST_SECRET = 'test-secret-auth-routes'

async function makeToken(payload: { username: string; isAdmin: boolean; empId: string | null }): Promise<string> {
  const secret = new TextEncoder().encode(TEST_SECRET)
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret)
}

beforeEach(() => {
  vi.resetAllMocks()
  mockEnsureKey.mockReturnValue(TEST_SECRET)
  mockNeedsSetup.mockReturnValue(false)
})

// ---------------------------------------------------------------------------
// GET /api/auth/config
// ---------------------------------------------------------------------------

describe('GET /api/auth/config', () => {
  it('returns 401 when not authenticated', async () => {
    const res = await authRoutes.request('/api/auth/config')
    expect(res.status).toBe(401)
  })

  it('returns user info for an authenticated admin', async () => {
    const token = await makeToken({ username: 'admin', isAdmin: true, empId: null })
    const res = await authRoutes.request('/api/auth/config', {
      headers: { Cookie: `session=${token}` },
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.username).toBe('admin')
    expect(body.is_admin).toBe(true)
    expect(body.emp_id).toBeNull()
    expect(body.restrict_edits).toBe(false)
    expect(body.needs_setup).toBe(false)
  })

  it('sets restrict_edits=true for a non-admin employee', async () => {
    const token = await makeToken({ username: 'emp', isAdmin: false, empId: '1' })
    const res = await authRoutes.request('/api/auth/config', {
      headers: { Cookie: `session=${token}` },
    })
    const body = await res.json()
    expect(body.restrict_edits).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// POST /api/auth/login
// ---------------------------------------------------------------------------

describe('POST /api/auth/login', () => {
  it('returns 403 when setup is needed', async () => {
    mockNeedsSetup.mockReturnValue(true)
    const res = await authRoutes.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'pass' }),
    })
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(body.needs_setup).toBe(true)
  })

  it('returns 401 for invalid credentials', async () => {
    mockAuthenticate.mockReturnValue({ ok: false, empId: null, isAdmin: false })
    const res = await authRoutes.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrong' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 200 with cookie and user info on successful login', async () => {
    mockAuthenticate.mockReturnValue({ ok: true, empId: null, isAdmin: true })
    const res = await authRoutes.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password123' }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.is_admin).toBe(true)
    expect(res.headers.get('set-cookie')).toContain('session=')
  })

  it('includes emp_id in the response for employee login', async () => {
    mockAuthenticate.mockReturnValue({ ok: true, empId: '42', isAdmin: false })
    const res = await authRoutes.request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'emp', password: 'pass' }),
    })
    const body = await res.json()
    expect(body.emp_id).toBe('42')
  })
})

// ---------------------------------------------------------------------------
// POST /api/auth/logout
// ---------------------------------------------------------------------------

describe('POST /api/auth/logout', () => {
  it('returns 200 and clears session cookie', async () => {
    const res = await authRoutes.request('/api/auth/logout', { method: 'POST' })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    // Cookie should be cleared
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('session=')
  })
})

// ---------------------------------------------------------------------------
// GET /api/auth/setup
// ---------------------------------------------------------------------------

describe('GET /api/auth/setup', () => {
  it('returns needs_setup=true when no admin exists', async () => {
    mockNeedsSetup.mockReturnValue(true)
    const res = await authRoutes.request('/api/auth/setup')
    expect(res.status).toBe(200)
    expect((await res.json()).needs_setup).toBe(true)
  })

  it('returns needs_setup=false when setup is complete', async () => {
    const res = await authRoutes.request('/api/auth/setup')
    expect((await res.json()).needs_setup).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// POST /api/auth/setup
// ---------------------------------------------------------------------------

describe('POST /api/auth/setup', () => {
  it('returns 400 when setup is already complete', async () => {
    mockNeedsSetup.mockReturnValue(false)
    const res = await authRoutes.request('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'pass', confirm: 'pass' }),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('Setup already complete')
  })

  it('returns 400 with validation error from createInitialAdmin', async () => {
    mockNeedsSetup.mockReturnValue(true)
    mockCreateInitialAdmin.mockReturnValue('Passwords do not match.')
    const res = await authRoutes.request('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'pass', confirm: 'other' }),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Passwords do not match.')
  })

  it('returns 200 and sets cookie on successful setup', async () => {
    mockNeedsSetup.mockReturnValue(true)
    mockCreateInitialAdmin.mockReturnValue(null)
    const res = await authRoutes.request('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password123', confirm: 'password123' }),
    })
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
    expect(res.headers.get('set-cookie')).toContain('session=')
  })
})
