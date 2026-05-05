import { Hono } from 'hono'
import { setCookie, deleteCookie } from 'hono/cookie'
import { SignJWT } from 'jose'
import { authenticate, createInitialAdmin, needsSetup } from '../application/userService.js'
import { ensureSecretKey } from '../infrastructure/settings.js'
import { authMiddleware } from '../middleware/auth.js'

const auth = new Hono()

async function makeToken(username: string, isAdmin: boolean, empId: string | null): Promise<string> {
  const secret = new TextEncoder().encode(ensureSecretKey())
  return new SignJWT({ username, isAdmin, empId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret)
}

auth.get('/api/auth/config', authMiddleware, c => {
  const user = c.get('user')
  return c.json({
    username: user.username,
    is_admin: user.isAdmin,
    emp_id: user.empId,
    restrict_edits: !user.isAdmin,
    needs_setup: false,
  })
})

auth.post('/api/auth/login', async c => {
  if (needsSetup()) return c.json({ ok: false, needs_setup: true }, 403)
  const { username = '', password = '' } = await c.req.json<{ username: string; password: string }>()
  const result = authenticate(username.trim(), password)
  if (!result.ok) return c.json({ ok: false, error: 'Invalid username or password.' }, 401)
  const token = await makeToken(username.trim(), result.isAdmin, result.empId)
  setCookie(c, 'session', token, {
    httpOnly: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  })
  return c.json({ ok: true, is_admin: result.isAdmin, emp_id: result.empId })
})

auth.post('/api/auth/logout', c => {
  deleteCookie(c, 'session', { path: '/' })
  return c.json({ ok: true })
})

auth.get('/api/auth/setup', c => {
  return c.json({ needs_setup: needsSetup() })
})

auth.post('/api/auth/setup', async c => {
  if (!needsSetup()) return c.json({ ok: false, error: 'Setup already complete.' }, 400)
  const { username = '', password = '', confirm = '' } = await c.req.json<{ username: string; password: string; confirm: string }>()
  const err = createInitialAdmin(username.trim(), password, confirm)
  if (err) return c.json({ ok: false, error: err }, 400)
  const token = await makeToken(username.trim(), true, null)
  setCookie(c, 'session', token, { httpOnly: true, sameSite: 'Lax', path: '/', maxAge: 7 * 24 * 60 * 60 })
  return c.json({ ok: true })
})

export default auth
