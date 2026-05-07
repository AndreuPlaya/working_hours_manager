import { pbkdf2Sync, timingSafeEqual } from 'crypto'
import bcrypt from 'bcryptjs'
import type { ClockEvent } from '../domain/models.js'
import { findUser, loadSettings, saveSettings } from '../infrastructure/settings.js'

// ---------------------------------------------------------------------------
// Password hashing — supports existing werkzeug PBKDF2 hashes + new bcrypt
// ---------------------------------------------------------------------------

function verifyWerkzeugHash(password: string, stored: string): boolean {
  const parts = stored.split('$')
  if (parts.length !== 3) return false
  const [methodStr, salt, expected] = parts
  const methodParts = methodStr.split(':')
  if (methodParts[0] !== 'pbkdf2' || methodParts.length < 3) return false
  const digestAlgo = methodParts[1]
  const iterations = parseInt(methodParts[2])
  if (isNaN(iterations)) return false
  const derived = pbkdf2Sync(password, salt, iterations, 32, digestAlgo)
  const derivedBuf = Buffer.from(derived.toString('hex'))
  const expectedBuf = Buffer.from(expected)
  if (derivedBuf.length !== expectedBuf.length) return false
  return timingSafeEqual(derivedBuf, expectedBuf)
}

export function hashPassword(raw: string): string {
  return bcrypt.hashSync(raw, 12)
}

export function verifyPassword(raw: string, stored: string): boolean {
  if (stored.startsWith('pbkdf2:')) return verifyWerkzeugHash(raw, stored)
  return bcrypt.compareSync(raw, stored)
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export interface AuthResult {
  ok: boolean
  empId: string | null
  isAdmin: boolean
}

export function authenticate(username: string, password: string): AuthResult {
  const { user, empId, isAdmin } = findUser(username)
  if (!user) return { ok: false, empId: null, isAdmin: false }
  if (!verifyPassword(password, (user as any).password_hash ?? '')) return { ok: false, empId: null, isAdmin: false }
  if (empId !== null && (user as any).enabled === false) return { ok: false, empId: null, isAdmin: false }
  return { ok: true, empId, isAdmin }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export function needsSetup(): boolean {
  return !Object.keys(loadSettings().admin_users ?? {}).length
}

export function createInitialAdmin(username: string, password: string, confirm: string): string | null {
  if (!username) return 'Username is required.'
  if (!password) return 'Password is required.'
  if (password.length < 8) return 'Password must be at least 8 characters.'
  if (password !== confirm) return 'Passwords do not match.'
  const s = loadSettings()
  s.admin_users ??= {}
  s.admin_users[username] = { password_hash: hashPassword(password) }
  saveSettings(s)
  return null
}

// ---------------------------------------------------------------------------
// Self-service password change
// ---------------------------------------------------------------------------

export const ERR_MISSING = 'MISSING_FIELDS'
export const ERR_NOT_FOUND = 'NOT_FOUND'
export const ERR_WRONG_PW = 'WRONG_PASSWORD'
export const ERR_USERNAME_TAKEN = 'USERNAME_TAKEN'

export function changePassword(username: string, currentPw: string, newPw: string): string | null {
  if (!currentPw || !newPw) return ERR_MISSING
  const { user, empId, isAdmin } = findUser(username)
  if (!user) return ERR_NOT_FOUND
  if (!verifyPassword(currentPw, (user as any).password_hash ?? '')) return ERR_WRONG_PW
  const s = loadSettings()
  const newHash = hashPassword(newPw)
  if (isAdmin) {
    s.admin_users[username].password_hash = newHash
  } else if (empId) {
    s.employees[empId].password_hash = newHash
  }
  saveSettings(s)
  return null
}

// ---------------------------------------------------------------------------
// Admin CRUD
// ---------------------------------------------------------------------------

export function listAdmins(): { username: string }[] {
  return Object.keys(loadSettings().admin_users ?? {}).map(u => ({ username: u }))
}

export function createAdmin(username: string, password: string): string | null {
  if (!username || !password) return ERR_MISSING
  const s = loadSettings()
  if (isUsernameTaken(username, s)) return 'USERNAME_TAKEN'
  s.admin_users ??= {}
  s.admin_users[username] = { password_hash: hashPassword(password) }
  saveSettings(s)
  return null
}

export function updateAdminPassword(username: string, newPassword: string): string | null {
  const s = loadSettings()
  if (!s.admin_users?.[username]) return ERR_NOT_FOUND
  if (newPassword) s.admin_users[username].password_hash = hashPassword(newPassword)
  saveSettings(s)
  return null
}

export function deleteAdmin(username: string, currentUsername: string | null): string | null {
  if (username === 'admin') return 'PROTECTED'
  if (username === currentUsername) return 'SELF_DELETE'
  const s = loadSettings()
  if (!s.admin_users?.[username]) return ERR_NOT_FOUND
  delete s.admin_users[username]
  saveSettings(s)
  return null
}

// ---------------------------------------------------------------------------
// Employee CRUD
// ---------------------------------------------------------------------------

export function listEmployees(events: ClockEvent[]): object[] {
  const known = new Map<string, string>()
  for (const e of events) known.set(e.empId, e.name)
  const s = loadSettings()
  const employees = s.employees ?? {}
  return [...known.keys()]
    .sort((a, b) => {
      const an = a.match(/^\d+$/) ? a.padStart(20, '0') : a
      const bn = b.match(/^\d+$/) ? b.padStart(20, '0') : b
      return an.localeCompare(bn)
    })
    .map(empId => {
      const emp = employees[empId] ?? {}
      return {
        emp_id: empId,
        raw_name: known.get(empId),
        alias: emp.alias ?? '',
        full_name: emp.full_name ?? '',
        email: emp.email ?? '',
        username: emp.username ?? '',
        has_password: Boolean(emp.password_hash),
        enabled: emp.enabled !== false,
      }
    })
}

export function updateEmployee(empId: string, data: Record<string, unknown>): string | null {
  const s = loadSettings()
  s.employees ??= {}
  s.employees[empId] ??= { alias: '', full_name: '', username: '', password_hash: '', is_admin: false, enabled: true }
  const emp = s.employees[empId]
  const newUsername = ((data.username as string | undefined) ?? emp.username ?? '').trim()
  if (newUsername && newUsername !== emp.username) {
    if (isUsernameTaken(newUsername, s, empId)) return 'USERNAME_TAKEN'
  }
  if ('alias' in data) emp.alias = (data.alias as string).trim()
  if ('full_name' in data) emp.full_name = (data.full_name as string).trim()
  if ('email' in data) emp.email = ((data.email as string) ?? '').trim()
  emp.username = newUsername
  if ('enabled' in data) emp.enabled = Boolean(data.enabled)
  if (data.password) emp.password_hash = hashPassword(data.password as string)
  saveSettings(s)
  return null
}

export function updateProfile(
  username: string,
  data: { full_name?: string; email?: string; username?: string; current_password?: string; new_password?: string }
): string | null {
  const { user, empId } = findUser(username)
  if (!user || !empId) return ERR_NOT_FOUND
  const s = loadSettings()
  const emp = s.employees[empId]
  const newUsername = (data.username ?? emp.username ?? '').trim()
  if (newUsername && newUsername !== emp.username) {
    if (isUsernameTaken(newUsername, s, empId)) return ERR_USERNAME_TAKEN
  }
  if (data.current_password && data.new_password) {
    if (!verifyPassword(data.current_password, emp.password_hash ?? '')) return ERR_WRONG_PW
    emp.password_hash = hashPassword(data.new_password)
  }
  if ('full_name' in data) emp.full_name = (data.full_name ?? '').trim()
  if ('email' in data) emp.email = (data.email ?? '').trim()
  emp.username = newUsername || emp.username
  saveSettings(s)
  return null
}

export function getUserConfig(empId: string): { full_name: string; email: string } {
  const emp = loadSettings().employees[empId]
  return { full_name: emp?.full_name ?? '', email: emp?.email ?? '' }
}

export function getProfiles(): Record<string, { alias: string; full_name: string }> {
  const employees = loadSettings().employees ?? {}
  return Object.fromEntries(
    Object.entries(employees).map(([id, emp]) => [id, { alias: emp.alias ?? '', full_name: emp.full_name ?? '' }])
  )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isUsernameTaken(username: string, s: ReturnType<typeof loadSettings>, excludeEmpId?: string): boolean {
  if (s.admin_users?.[username]) return true
  for (const [id, emp] of Object.entries(s.employees ?? {})) {
    if (id === excludeEmpId) continue
    if (emp.username === username) return true
  }
  return false
}
