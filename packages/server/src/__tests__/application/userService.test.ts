import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../infrastructure/settings.js')
vi.mock('bcryptjs')

import { findUser, loadSettings, saveSettings } from '../../infrastructure/settings.js'
import bcrypt from 'bcryptjs'
import { pbkdf2Sync } from 'crypto'
import {
  hashPassword,
  verifyPassword,
  authenticate,
  needsSetup,
  createInitialAdmin,
  changePassword,
  listAdmins,
  createAdmin,
  updateAdminPassword,
  deleteAdmin,
  listEmployees,
  updateEmployee,
  getProfiles,
  ERR_MISSING,
  ERR_NOT_FOUND,
  ERR_WRONG_PW,
} from '../../application/userService.js'
import type { Settings, EmployeeRecord } from '../../infrastructure/settings.js'

const mockFindUser = vi.mocked(findUser)
const mockLoadSettings = vi.mocked(loadSettings)
const mockSaveSettings = vi.mocked(saveSettings)
const mockBcryptHash = vi.mocked(bcrypt.hashSync)
const mockBcryptCompare = vi.mocked(bcrypt.compareSync)

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return { employees: {}, admin_users: {}, secret_key: '', ...overrides }
}

function makeEmp(overrides: Partial<EmployeeRecord> = {}): EmployeeRecord {
  return { alias: '', full_name: '', username: 'user', password_hash: '$2b$mock', is_admin: false, enabled: true, ...overrides }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockLoadSettings.mockReturnValue(makeSettings())
  mockBcryptHash.mockReturnValue('$2b$hashed' as unknown as string)
  mockBcryptCompare.mockReturnValue(true as unknown as boolean)
})

// ---------------------------------------------------------------------------
// hashPassword
// ---------------------------------------------------------------------------

describe('hashPassword', () => {
  it('delegates to bcrypt.hashSync with 12 rounds', () => {
    hashPassword('secret')
    expect(mockBcryptHash).toHaveBeenCalledWith('secret', 12)
  })

  it('returns the bcrypt result', () => {
    expect(hashPassword('x')).toBe('$2b$hashed')
  })
})

// ---------------------------------------------------------------------------
// verifyPassword
// ---------------------------------------------------------------------------

describe('verifyPassword', () => {
  it('uses bcrypt for non-werkzeug hashes', () => {
    verifyPassword('pass', '$2b$12$xxx')
    expect(mockBcryptCompare).toHaveBeenCalledWith('pass', '$2b$12$xxx')
  })

  it('returns true for a correct werkzeug PBKDF2 hash', () => {
    const password = 'testpassword'
    const salt = 'testsalt'
    const iterations = 1
    const derived = pbkdf2Sync(password, salt, iterations, 32, 'sha256')
    const stored = `pbkdf2:sha256:${iterations}$${salt}$${derived.toString('hex')}`
    expect(verifyPassword(password, stored)).toBe(true)
  })

  it('returns false for wrong password against werkzeug hash', () => {
    const salt = 'testsalt'
    const derived = pbkdf2Sync('correctpassword', salt, 1, 32, 'sha256')
    const stored = `pbkdf2:sha256:1$${salt}$${derived.toString('hex')}`
    expect(verifyPassword('wrongpassword', stored)).toBe(false)
  })

  it('returns false when werkzeug hash has wrong number of $ parts', () => {
    expect(verifyPassword('pass', 'pbkdf2:sha256:1$only-two-parts')).toBe(false)
  })

  it('returns false when werkzeug method has fewer than 3 colon parts', () => {
    expect(verifyPassword('pass', 'pbkdf2:sha256$salt$hash')).toBe(false)
  })

  it('returns false when werkzeug iterations is NaN', () => {
    expect(verifyPassword('pass', 'pbkdf2:sha256:notanumber$salt$hash')).toBe(false)
  })

  it('returns false when derived length differs from expected (truncated expected)', () => {
    // 32-byte derived → 64-char hex → Buffer of 64 bytes
    // if expected is short (e.g. 10 chars), lengths differ
    expect(verifyPassword('pass', 'pbkdf2:sha256:1$salt$short')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// authenticate
// ---------------------------------------------------------------------------

describe('authenticate', () => {
  it('returns ok=false when user is not found', () => {
    mockFindUser.mockReturnValue({ user: null, empId: null, isAdmin: false })
    expect(authenticate('nobody', 'pw').ok).toBe(false)
  })

  it('returns ok=false when password is wrong', () => {
    mockFindUser.mockReturnValue({ user: { password_hash: '$2b$x' }, empId: null, isAdmin: true })
    mockBcryptCompare.mockReturnValue(false as unknown as boolean)
    expect(authenticate('admin', 'wrong').ok).toBe(false)
  })

  it('returns ok=false when employee is disabled', () => {
    mockFindUser.mockReturnValue({ user: makeEmp({ enabled: false }), empId: '1', isAdmin: false })
    expect(authenticate('user', 'pw').ok).toBe(false)
  })

  it('returns ok=true for a valid admin login', () => {
    mockFindUser.mockReturnValue({ user: { password_hash: '$2b$x' }, empId: null, isAdmin: true })
    const result = authenticate('admin', 'pass')
    expect(result).toEqual({ ok: true, empId: null, isAdmin: true })
  })

  it('returns ok=true for a valid employee login', () => {
    mockFindUser.mockReturnValue({ user: makeEmp(), empId: '42', isAdmin: false })
    const result = authenticate('user', 'pass')
    expect(result).toEqual({ ok: true, empId: '42', isAdmin: false })
  })

  it('covers password_hash ?? "" when hash is null (hits null branch)', () => {
    mockFindUser.mockReturnValue({ user: { password_hash: null }, empId: null, isAdmin: true })
    const result = authenticate('admin', 'pass')
    expect(mockBcryptCompare).toHaveBeenCalledWith('pass', '')
    expect(result.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// needsSetup
// ---------------------------------------------------------------------------

describe('needsSetup', () => {
  it('returns true when there are no admin users', () => {
    expect(needsSetup()).toBe(true)
  })

  it('returns true when admin_users is null (covers ?? {} branch)', () => {
    mockLoadSettings.mockReturnValue({ employees: {}, admin_users: null as any, secret_key: '' })
    expect(needsSetup()).toBe(true)
  })

  it('returns false when at least one admin user exists', () => {
    mockLoadSettings.mockReturnValue(makeSettings({ admin_users: { admin: { password_hash: 'h' } } }))
    expect(needsSetup()).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// createInitialAdmin
// ---------------------------------------------------------------------------

describe('createInitialAdmin', () => {
  it('returns error when username is empty', () => {
    expect(createInitialAdmin('', 'password123', 'password123')).toBe('Username is required.')
  })

  it('returns error when password is empty', () => {
    expect(createInitialAdmin('admin', '', '')).toBe('Password is required.')
  })

  it('returns error when password is too short', () => {
    expect(createInitialAdmin('admin', 'short', 'short')).toBe('Password must be at least 8 characters.')
  })

  it('returns error when passwords do not match', () => {
    expect(createInitialAdmin('admin', 'password123', 'different')).toBe('Passwords do not match.')
  })

  it('returns null and saves settings on success', () => {
    const result = createInitialAdmin('admin', 'password123', 'password123')
    expect(result).toBeNull()
    expect(mockSaveSettings).toHaveBeenCalled()
  })

  it('initialises admin_users when it is null in settings (hits ??= branch)', () => {
    mockLoadSettings.mockReturnValue({ employees: {}, admin_users: null as any, secret_key: '' })
    const result = createInitialAdmin('newadmin', 'password123', 'password123')
    expect(result).toBeNull()
    expect(mockSaveSettings).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// changePassword
// ---------------------------------------------------------------------------

describe('changePassword', () => {
  it('returns ERR_MISSING when fields are empty', () => {
    expect(changePassword('user', '', 'new')).toBe(ERR_MISSING)
    expect(changePassword('user', 'old', '')).toBe(ERR_MISSING)
  })

  it('returns ERR_NOT_FOUND when user is not found', () => {
    mockFindUser.mockReturnValue({ user: null, empId: null, isAdmin: false })
    expect(changePassword('nobody', 'old', 'new')).toBe(ERR_NOT_FOUND)
  })

  it('returns ERR_WRONG_PW when current password is wrong', () => {
    mockFindUser.mockReturnValue({ user: { password_hash: '$2b$x' }, empId: null, isAdmin: true })
    mockBcryptCompare.mockReturnValue(false as unknown as boolean)
    expect(changePassword('admin', 'wrong', 'new')).toBe(ERR_WRONG_PW)
  })

  it('saves the new hash for an admin user', () => {
    const settings = makeSettings({ admin_users: { admin: { password_hash: '$2b$old' } } })
    mockLoadSettings.mockReturnValue(settings)
    mockFindUser.mockReturnValue({ user: { password_hash: '$2b$old' }, empId: null, isAdmin: true })
    const result = changePassword('admin', 'oldpass', 'newpass')
    expect(result).toBeNull()
    expect(mockSaveSettings).toHaveBeenCalled()
  })

  it('saves the new hash for an employee user', () => {
    const settings = makeSettings({
      employees: { '1': makeEmp({ password_hash: '$2b$old' }) },
    })
    mockLoadSettings.mockReturnValue(settings)
    mockFindUser.mockReturnValue({ user: makeEmp({ password_hash: '$2b$old' }), empId: '1', isAdmin: false })
    const result = changePassword('user', 'oldpass', 'newpass')
    expect(result).toBeNull()
    expect(mockSaveSettings).toHaveBeenCalled()
  })

  it('covers password_hash ?? "" when hash is null (hits null branch)', () => {
    const settings = makeSettings({ admin_users: { admin: { password_hash: null as any } } })
    mockLoadSettings.mockReturnValue(settings)
    mockFindUser.mockReturnValue({ user: { password_hash: null }, empId: null, isAdmin: true })
    const result = changePassword('admin', 'oldpass', 'newpass')
    expect(mockBcryptCompare).toHaveBeenCalledWith('oldpass', '')
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// listAdmins
// ---------------------------------------------------------------------------

describe('listAdmins', () => {
  it('returns an array of admin username objects', () => {
    mockLoadSettings.mockReturnValue(makeSettings({ admin_users: { admin: { password_hash: 'h' }, ops: { password_hash: 'h2' } } }))
    const result = listAdmins()
    expect(result).toEqual(expect.arrayContaining([{ username: 'admin' }, { username: 'ops' }]))
  })

  it('returns an empty array when there are no admins', () => {
    expect(listAdmins()).toEqual([])
  })

  it('returns empty array when admin_users is null (covers ?? {} branch)', () => {
    mockLoadSettings.mockReturnValue({ employees: {}, admin_users: null as any, secret_key: '' })
    expect(listAdmins()).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// createAdmin
// ---------------------------------------------------------------------------

describe('createAdmin', () => {
  it('returns ERR_MISSING when username or password is empty', () => {
    expect(createAdmin('', 'pass')).toBe(ERR_MISSING)
    expect(createAdmin('admin', '')).toBe(ERR_MISSING)
  })

  it('returns USERNAME_TAKEN when admin username already exists', () => {
    mockLoadSettings.mockReturnValue(makeSettings({ admin_users: { admin: { password_hash: 'h' } } }))
    expect(createAdmin('admin', 'password123')).toBe('USERNAME_TAKEN')
  })

  it('returns USERNAME_TAKEN when username is taken by an employee', () => {
    mockLoadSettings.mockReturnValue(makeSettings({
      employees: { '1': makeEmp({ username: 'alice' }) },
    }))
    expect(createAdmin('alice', 'password123')).toBe('USERNAME_TAKEN')
  })

  it('returns null and saves on success', () => {
    const result = createAdmin('newadmin', 'password123')
    expect(result).toBeNull()
    expect(mockSaveSettings).toHaveBeenCalled()
  })

  it('handles null employees in settings without error (isUsernameTaken fallback)', () => {
    mockLoadSettings.mockReturnValue({ employees: null as any, admin_users: {}, secret_key: '' })
    const result = createAdmin('newadmin', 'password123')
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// updateAdminPassword
// ---------------------------------------------------------------------------

describe('updateAdminPassword', () => {
  it('returns ERR_NOT_FOUND when admin does not exist', () => {
    expect(updateAdminPassword('ghost', 'newpass')).toBe(ERR_NOT_FOUND)
  })

  it('updates the hash and saves when admin exists and password is provided', () => {
    mockLoadSettings.mockReturnValue(makeSettings({ admin_users: { admin: { password_hash: 'old' } } }))
    expect(updateAdminPassword('admin', 'newpass')).toBeNull()
    expect(mockSaveSettings).toHaveBeenCalled()
  })

  it('saves without changing hash when new password is empty string', () => {
    mockLoadSettings.mockReturnValue(makeSettings({ admin_users: { admin: { password_hash: 'old' } } }))
    updateAdminPassword('admin', '')
    expect(mockSaveSettings).toHaveBeenCalled()
    expect(mockBcryptHash).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// deleteAdmin
// ---------------------------------------------------------------------------

describe('deleteAdmin', () => {
  it('returns PROTECTED when trying to delete the built-in admin', () => {
    expect(deleteAdmin('admin', 'superuser')).toBe('PROTECTED')
  })

  it('returns SELF_DELETE when deleting own account', () => {
    expect(deleteAdmin('me', 'me')).toBe('SELF_DELETE')
  })

  it('returns ERR_NOT_FOUND when admin does not exist', () => {
    expect(deleteAdmin('ghost', 'admin')).toBe(ERR_NOT_FOUND)
  })

  it('returns null and saves when deletion is successful', () => {
    mockLoadSettings.mockReturnValue(makeSettings({ admin_users: { ops: { password_hash: 'h' } } }))
    expect(deleteAdmin('ops', 'admin')).toBeNull()
    expect(mockSaveSettings).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// listEmployees
// ---------------------------------------------------------------------------

describe('listEmployees', () => {
  it('returns empty array when no events', () => {
    expect(listEmployees([])).toEqual([])
  })

  it('merges event data with settings and computes has_password', () => {
    const events = [{ empId: '1', name: 'Alice', dept: 'Admin', timestamp: new Date() }]
    mockLoadSettings.mockReturnValue(makeSettings({
      employees: { '1': makeEmp({ username: 'alice', full_name: 'Alice Smith', password_hash: 'hash' }) },
    }))
    const result = listEmployees(events) as Array<Record<string, unknown>>
    expect(result[0]).toMatchObject({
      emp_id: '1',
      raw_name: 'Alice',
      username: 'alice',
      has_password: true,
      enabled: true,
    })
  })

  it('shows has_password=false when password_hash is empty', () => {
    const events = [{ empId: '2', name: 'Bob', dept: 'HR', timestamp: new Date() }]
    mockLoadSettings.mockReturnValue(makeSettings({
      employees: { '2': makeEmp({ password_hash: '' }) },
    }))
    const result = listEmployees(events) as Array<Record<string, unknown>>
    expect(result[0].has_password).toBe(false)
  })

  it('sorts employees by numeric id', () => {
    const events = [
      { empId: '10', name: 'C', dept: 'D', timestamp: new Date() },
      { empId: '2', name: 'B', dept: 'D', timestamp: new Date() },
    ]
    const result = listEmployees(events) as Array<Record<string, unknown>>
    expect(result[0].emp_id).toBe('2')
    expect(result[1].emp_id).toBe('10')
  })

  it('defaults enabled=true for employees without explicit setting', () => {
    const events = [{ empId: '5', name: 'X', dept: 'D', timestamp: new Date() }]
    const result = listEmployees(events) as Array<Record<string, unknown>>
    expect(result[0].enabled).toBe(true)
  })

  it('falls back to empty object when employees is null in settings', () => {
    mockLoadSettings.mockReturnValue({ employees: null as any, admin_users: {}, secret_key: '' })
    const events = [{ empId: '1', name: 'Alice', dept: 'Admin', timestamp: new Date() }]
    const result = listEmployees(events) as Array<Record<string, unknown>>
    expect(result[0].emp_id).toBe('1')
    expect(result[0].alias).toBe('')
  })

  it('sorts non-numeric empIds lexicographically alongside numeric ones', () => {
    const events = [
      { empId: 'alice', name: 'Alice', dept: 'Admin', timestamp: new Date() },
      { empId: '1', name: 'One', dept: 'Admin', timestamp: new Date() },
    ]
    const result = listEmployees(events) as Array<Record<string, unknown>>
    // numeric '1' sorts before non-numeric 'alice' (padded '000...1' < 'alice')
    expect(result[0].emp_id).toBe('1')
    expect(result[1].emp_id).toBe('alice')
  })

  it('sorts two non-numeric empIds lexicographically (covers : a branch in sort)', () => {
    // Both empIds non-numeric ensures the comparator receives a non-numeric a argument
    const events = [
      { empId: 'alice', name: 'Alice', dept: 'Admin', timestamp: new Date() },
      { empId: 'bob', name: 'Bob', dept: 'Admin', timestamp: new Date() },
    ]
    const result = listEmployees(events) as Array<Record<string, unknown>>
    expect(result[0].emp_id).toBe('alice')
    expect(result[1].emp_id).toBe('bob')
  })
})

// ---------------------------------------------------------------------------
// updateEmployee
// ---------------------------------------------------------------------------

describe('updateEmployee', () => {
  it('returns USERNAME_TAKEN when new username is taken by another employee', () => {
    mockLoadSettings.mockReturnValue(makeSettings({
      employees: {
        '1': makeEmp({ username: 'alice' }),
        '2': makeEmp({ username: 'bob' }),
      },
    }))
    expect(updateEmployee('1', { username: 'bob' })).toBe('USERNAME_TAKEN')
  })

  it('does not flag conflict when username is unchanged', () => {
    mockLoadSettings.mockReturnValue(makeSettings({
      employees: { '1': makeEmp({ username: 'alice' }) },
    }))
    expect(updateEmployee('1', { username: 'alice' })).toBeNull()
  })

  it('updates alias, full_name, username, enabled', () => {
    mockLoadSettings.mockReturnValue(makeSettings({
      employees: { '1': makeEmp() },
    }))
    updateEmployee('1', { alias: 'Al', full_name: 'Alice', username: 'alice2', enabled: false })
    const saved = mockSaveSettings.mock.calls[0][0]
    expect(saved.employees['1'].alias).toBe('Al')
    expect(saved.employees['1'].full_name).toBe('Alice')
    expect(saved.employees['1'].username).toBe('alice2')
    expect(saved.employees['1'].enabled).toBe(false)
  })

  it('hashes and saves password when provided', () => {
    mockLoadSettings.mockReturnValue(makeSettings({ employees: { '1': makeEmp() } }))
    updateEmployee('1', { password: 'newpass' })
    expect(mockBcryptHash).toHaveBeenCalledWith('newpass', 12)
  })

  it('does not change password_hash when password is not in data', () => {
    mockLoadSettings.mockReturnValue(makeSettings({ employees: { '1': makeEmp({ password_hash: 'original' }) } }))
    updateEmployee('1', { alias: 'X' })
    const saved = mockSaveSettings.mock.calls[0][0]
    expect(saved.employees['1'].password_hash).toBe('original')
  })

  it('creates a new employee record when empId is not in settings', () => {
    updateEmployee('99', { alias: 'New' })
    const saved = mockSaveSettings.mock.calls[0][0]
    expect(saved.employees['99']).toBeDefined()
    expect(saved.employees['99'].alias).toBe('New')
  })

  it('initialises employees object when it is null (hits ??= branch)', () => {
    mockLoadSettings.mockReturnValue({ employees: null as any, admin_users: {}, secret_key: '' })
    const result = updateEmployee('1', { alias: 'X' })
    expect(result).toBeNull()
    expect(mockSaveSettings).toHaveBeenCalled()
  })

  it('falls back to empty string for username when employee has no username set', () => {
    mockLoadSettings.mockReturnValue(makeSettings({
      employees: { '1': makeEmp({ username: null as any }) },
    }))
    // No username in data → uses emp.username (null) → falls back to ''
    updateEmployee('1', { alias: 'X' })
    const saved = mockSaveSettings.mock.calls[0][0]
    expect(saved.employees['1'].username).toBe('')
  })

  it('skips username conflict check when newUsername is empty', () => {
    mockLoadSettings.mockReturnValue(makeSettings({ employees: { '1': makeEmp({ username: 'alice' }) } }))
    // Passing empty string username → newUsername = '' → falsy → skip conflict check
    const result = updateEmployee('1', { username: '' })
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// getProfiles
// ---------------------------------------------------------------------------

describe('getProfiles', () => {
  it('returns alias and full_name per empId', () => {
    mockLoadSettings.mockReturnValue(makeSettings({
      employees: {
        '1': makeEmp({ alias: 'Al', full_name: 'Alice' }),
      },
    }))
    const profiles = getProfiles()
    expect(profiles['1']).toEqual({ alias: 'Al', full_name: 'Alice' })
  })

  it('returns empty object when there are no employees', () => {
    expect(getProfiles()).toEqual({})
  })

  it('falls back to empty string for alias and full_name when undefined', () => {
    mockLoadSettings.mockReturnValue(makeSettings({
      employees: {
        '1': { alias: undefined as any, full_name: undefined as any, username: 'u', password_hash: '', is_admin: false, enabled: true },
      },
    }))
    const profiles = getProfiles()
    expect(profiles['1'].alias).toBe('')
    expect(profiles['1'].full_name).toBe('')
  })

  it('falls back to empty object when employees is null', () => {
    mockLoadSettings.mockReturnValue({ employees: null as any, admin_users: {}, secret_key: '' })
    expect(getProfiles()).toEqual({})
  })
})
