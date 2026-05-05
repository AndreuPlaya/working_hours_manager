import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('fs')
vi.mock('crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('crypto')>()
  return { ...actual, randomBytes: vi.fn() }
})

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { randomBytes } from 'crypto'
import {
  setDataRoot,
  getDataRoot,
  loadSettings,
  saveSettings,
  loadAppConfig,
  saveAppConfig,
  ensureSecretKey,
  findUser,
} from '../../infrastructure/settings.js'
import type { Settings } from '../../infrastructure/settings.js'

const mockExists = vi.mocked(existsSync)
const mockRead = vi.mocked(readFileSync)
const mockWrite = vi.mocked(writeFileSync)
const mockMkdir = vi.mocked(mkdirSync)
const mockRandomBytes = vi.mocked(randomBytes)

beforeEach(() => {
  vi.resetAllMocks()
  setDataRoot('/test-root')
})

// ---------------------------------------------------------------------------
// setDataRoot / getDataRoot
// ---------------------------------------------------------------------------

describe('setDataRoot / getDataRoot', () => {
  it('round-trips the data root path', () => {
    setDataRoot('/my/data')
    expect(getDataRoot()).toBe('/my/data')
  })
})

// ---------------------------------------------------------------------------
// loadSettings
// ---------------------------------------------------------------------------

describe('loadSettings', () => {
  it('returns defaults when config file does not exist', () => {
    mockExists.mockReturnValue(false)
    const s = loadSettings()
    expect(s).toEqual({ employees: {}, admin_users: {}, secret_key: '' })
  })

  it('returns parsed settings when file exists and is valid JSON', () => {
    mockExists.mockReturnValue(true)
    const settings: Settings = { employees: {}, admin_users: { admin: { password_hash: 'x' } }, secret_key: 'abc' }
    mockRead.mockReturnValue(JSON.stringify(settings))
    expect(loadSettings()).toEqual(settings)
  })

  it('returns defaults when file exists but contains invalid JSON', () => {
    mockExists.mockReturnValue(true)
    mockRead.mockReturnValue('not-valid-json{{{')
    const s = loadSettings()
    expect(s).toEqual({ employees: {}, admin_users: {}, secret_key: '' })
  })
})

// ---------------------------------------------------------------------------
// saveSettings
// ---------------------------------------------------------------------------

describe('saveSettings', () => {
  it('creates the config directory and writes formatted JSON', () => {
    const s: Settings = { employees: {}, admin_users: {}, secret_key: 'key' }
    saveSettings(s)
    expect(mockMkdir).toHaveBeenCalledWith('/test-root/config', { recursive: true })
    expect(mockWrite).toHaveBeenCalledWith(
      '/test-root/config/settings.json',
      JSON.stringify(s, null, 2),
      'utf-8'
    )
  })
})

// ---------------------------------------------------------------------------
// loadAppConfig / saveAppConfig
// ---------------------------------------------------------------------------

describe('loadAppConfig', () => {
  it('returns empty object when app_config is not set', () => {
    mockExists.mockReturnValue(true)
    mockRead.mockReturnValue(JSON.stringify({ employees: {}, admin_users: {}, secret_key: '' }))
    expect(loadAppConfig()).toEqual({})
  })

  it('returns the stored app_config', () => {
    mockExists.mockReturnValue(true)
    mockRead.mockReturnValue(JSON.stringify({ employees: {}, admin_users: {}, secret_key: '', app_config: { time_format: '12h', theme: 'dark' } }))
    expect(loadAppConfig()).toEqual({ time_format: '12h', theme: 'dark' })
  })
})

describe('saveAppConfig', () => {
  it('merges app_config into settings and saves', () => {
    mockExists.mockReturnValue(true)
    mockRead.mockReturnValue(JSON.stringify({ employees: {}, admin_users: {}, secret_key: 'k' }))
    saveAppConfig({ time_format: '24h', theme: 'green' })
    expect(mockWrite).toHaveBeenCalled()
    const written = JSON.parse(mockWrite.mock.calls[0][1] as string)
    expect(written.app_config).toEqual({ time_format: '24h', theme: 'green' })
  })
})

// ---------------------------------------------------------------------------
// ensureSecretKey
// ---------------------------------------------------------------------------

describe('ensureSecretKey', () => {
  it('returns the existing secret_key without generating a new one', () => {
    mockExists.mockReturnValue(true)
    const settings: Settings = { employees: {}, admin_users: {}, secret_key: 'existing-key' }
    mockRead.mockReturnValue(JSON.stringify(settings))
    const key = ensureSecretKey()
    expect(key).toBe('existing-key')
    expect(mockRandomBytes).not.toHaveBeenCalled()
  })

  it('generates and saves a new key when secret_key is empty', () => {
    mockExists.mockReturnValue(true)
    const settings: Settings = { employees: {}, admin_users: {}, secret_key: '' }
    mockRead.mockReturnValue(JSON.stringify(settings))
    const fakeBytes = { toString: () => 'generated-hex-key' } as unknown as Buffer
    mockRandomBytes.mockReturnValue(fakeBytes)
    const key = ensureSecretKey()
    expect(key).toBe('generated-hex-key')
    expect(mockWrite).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// findUser
// ---------------------------------------------------------------------------

describe('findUser', () => {
  const makeSettings = (overrides: Partial<Settings> = {}): Settings => ({
    employees: {},
    admin_users: {},
    secret_key: '',
    ...overrides,
  })

  it('returns an admin record when username matches admin_users', () => {
    mockExists.mockReturnValue(true)
    mockRead.mockReturnValue(JSON.stringify(makeSettings({ admin_users: { admin: { password_hash: 'hash' } } })))
    const result = findUser('admin')
    expect(result.isAdmin).toBe(true)
    expect(result.empId).toBeNull()
    expect(result.user).toEqual({ password_hash: 'hash' })
  })

  it('returns an employee record when username matches an employee', () => {
    mockExists.mockReturnValue(true)
    const settings = makeSettings({
      employees: {
        '42': {
          alias: '',
          full_name: 'Bob',
          username: 'bob',
          password_hash: 'h',
          is_admin: false,
          enabled: true,
        },
      },
    })
    mockRead.mockReturnValue(JSON.stringify(settings))
    const result = findUser('bob')
    expect(result.empId).toBe('42')
    expect(result.isAdmin).toBe(false)
  })

  it('returns isAdmin=true for an employee with is_admin flag', () => {
    mockExists.mockReturnValue(true)
    const settings = makeSettings({
      employees: {
        '5': {
          alias: '',
          full_name: 'Sup',
          username: 'sup',
          password_hash: 'h',
          is_admin: true,
          enabled: true,
        },
      },
    })
    mockRead.mockReturnValue(JSON.stringify(settings))
    const result = findUser('sup')
    expect(result.isAdmin).toBe(true)
  })

  it('returns user=null when the username is not found anywhere', () => {
    mockExists.mockReturnValue(true)
    mockRead.mockReturnValue(JSON.stringify(makeSettings()))
    const result = findUser('nobody')
    expect(result.user).toBeNull()
    expect(result.empId).toBeNull()
    expect(result.isAdmin).toBe(false)
  })

  it('handles null employees in settings (falls back to empty object)', () => {
    mockExists.mockReturnValue(true)
    const settings = { ...makeSettings(), employees: null }
    mockRead.mockReturnValue(JSON.stringify(settings))
    const result = findUser('nobody')
    expect(result.user).toBeNull()
  })

  it('defaults is_admin to false when employee.is_admin is undefined', () => {
    mockExists.mockReturnValue(true)
    const settings = makeSettings({
      employees: {
        '1': {
          alias: '',
          full_name: 'Bob',
          username: 'bob',
          password_hash: 'h',
          is_admin: undefined as unknown as boolean,
          enabled: true,
        },
      },
    })
    mockRead.mockReturnValue(JSON.stringify(settings))
    const result = findUser('bob')
    expect(result.isAdmin).toBe(false)
  })
})
