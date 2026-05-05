import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { randomBytes } from 'crypto'
import { join } from 'path'

export interface EmployeeRecord {
  alias: string
  full_name: string
  username: string
  password_hash: string
  is_admin: boolean
  enabled: boolean
  email?: string
}

export interface AdminRecord {
  password_hash: string
}

export interface AppConfig {
  time_format?: '24h' | '12h'
  theme?: string
  favicon_ext?: string
  date_format?: string
}

export interface Settings {
  employees: Record<string, EmployeeRecord>
  admin_users: Record<string, AdminRecord>
  secret_key: string
  app_config?: AppConfig
}

let dataRoot = process.env.DATA_DIR ?? '.'

export function setDataRoot(root: string): void {
  dataRoot = root
}

export function getDataRoot(): string {
  return dataRoot
}

function configPath(): string {
  return join(dataRoot, 'config', 'settings.json')
}

export function loadSettings(): Settings {
  const p = configPath()
  if (existsSync(p)) {
    try {
      return JSON.parse(readFileSync(p, 'utf-8')) as Settings
    } catch {
      // fall through
    }
  }
  return { employees: {}, admin_users: {}, secret_key: '' }
}

export function saveSettings(s: Settings): void {
  const p = configPath()
  mkdirSync(join(dataRoot, 'config'), { recursive: true })
  writeFileSync(p, JSON.stringify(s, null, 2), 'utf-8')
}

export function loadAppConfig(): AppConfig {
  return loadSettings().app_config ?? {}
}

export function saveAppConfig(cfg: AppConfig): void {
  const s = loadSettings()
  s.app_config = cfg
  saveSettings(s)
}

export function ensureSecretKey(): string {
  const s = loadSettings()
  if (!s.secret_key) {
    s.secret_key = randomBytes(32).toString('hex')
    saveSettings(s)
  }
  return s.secret_key
}

export interface UserLookup {
  user: EmployeeRecord | AdminRecord | null
  empId: string | null
  isAdmin: boolean
}

export function findUser(username: string): UserLookup {
  const s = loadSettings()
  const admin = s.admin_users?.[username]
  if (admin) return { user: admin, empId: null, isAdmin: true }
  for (const [empId, emp] of Object.entries(s.employees ?? {})) {
    if (emp.username === username) {
      return { user: emp, empId, isAdmin: emp.is_admin ?? false }
    }
  }
  return { user: null, empId: null, isAdmin: false }
}
