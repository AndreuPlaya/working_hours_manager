import { createMiddleware } from 'hono/factory'
import { getCookie } from 'hono/cookie'
import { jwtVerify } from 'jose'
import { ensureSecretKey } from '../infrastructure/settings.js'

export interface SessionUser {
  username: string
  isAdmin: boolean
  empId: string | null
}

declare module 'hono' {
  interface ContextVariableMap {
    user: SessionUser
  }
}

export const authMiddleware = createMiddleware(async (c, next) => {
  const token = getCookie(c, 'session')
  if (!token) return c.json({ ok: false, error: 'Not authenticated.' }, 401)
  try {
    const secret = new TextEncoder().encode(ensureSecretKey())
    const { payload } = await jwtVerify(token, secret)
    c.set('user', {
      username: payload.username as string,
      isAdmin: payload.isAdmin as boolean,
      empId: (payload.empId as string | null) ?? null,
    })
    return await next()
  } catch {
    return c.json({ ok: false, error: 'Session expired.' }, 401)
  }
})

export const adminMiddleware = createMiddleware(async (c, next) => {
  const user = c.get('user')
  if (!user?.isAdmin) return c.json({ ok: false, error: 'Admin access required.' }, 403)
  return await next()
})
