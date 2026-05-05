export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, (data as any).error ?? res.statusText)
  return data as T
}

const get = <T>(url: string) => request<T>('GET', url)
const post = <T>(url: string, body: unknown) => request<T>('POST', url, body)
const put = <T>(url: string, body: unknown) => request<T>('PUT', url, body)
const del = <T>(url: string) => request<T>('DELETE', url)

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Config {
  username: string
  is_admin: boolean
  emp_id: string | null
  restrict_edits: boolean
  full_name?: string
  email?: string
}

export interface AppConfigResponse {
  theme: string
  date_format?: string
}

export interface Profile {
  alias: string
  full_name: string
}

export interface EventRow {
  date: string
  clock_in: string
  clock_out: string | null
  duration: string | null
  incomplete: boolean
}

export interface ReportUrl {
  stem: string
  year: number
  url: string
}

export interface PendingItem {
  id: string
  action: 'ADD' | 'EDIT' | 'DEL'
  emp_id: string
  name: string
  dept: string
  timestamp: string
  new_timestamp: string | null
  submitted_at: string
  submitted_by: string
}

export interface ReportRow {
  dateLabel: string
  clockIn: string
  clockOut: string
  duration: string
  isSubtotal: boolean
  isIncomplete: boolean
}

export interface MonthReport {
  label: string
  rows: ReportRow[]
  total: string
}

export interface EmployeeReport {
  name: string
  dept: string
  emp_id: string
  year: number
  months: MonthReport[]
  year_total: string
}

export interface ReportIndex {
  years: string[]
  stems_by_year: Record<string, { stem: string; display: string }[]>
}

export interface Employee {
  emp_id: string
  raw_name: string
  alias: string
  full_name: string
  email: string
  username: string
  has_password: boolean
  enabled: boolean
}

export interface AdminAccount {
  username: string
}

export interface RawFile {
  name: string
  size: number
  modified: number
}

export interface PreviewResult {
  employee: string
  emp_id: string
  month_label: string
  affected_date: string
  before: { rows: object[]; month_total: string }
  after: { rows: object[]; month_total: string }
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const api = {
  auth: {
    config: () => get<Config>('/api/auth/config'),
    login: (username: string, password: string) => post<{ ok: boolean; is_admin: boolean; emp_id: string | null }>('/api/auth/login', { username, password }),
    logout: () => post<{ ok: boolean }>('/api/auth/logout', {}),
    setup: (username: string, password: string, confirm: string) => post<{ ok: boolean }>('/api/auth/setup', { username, password, confirm }),
    setupStatus: () => get<{ needs_setup: boolean }>('/api/auth/setup'),
  },

  // Editor
  events: () => get<Record<string, EventRow[]>>('/api/events'),
  profiles: () => get<Record<string, Profile>>('/api/profiles'),
  config: () => get<Config>('/api/config'),
  myReports: () => get<ReportUrl[]>('/api/my-reports'),
  myPending: () => get<PendingItem[]>('/api/my-pending'),
  add: (body: { emp_id: string; name: string; dept: string; timestamp: string }) => post<{ ok: boolean; pending?: boolean }>('/api/add', body),
  edit: (body: { emp_id: string; name: string; dept: string; old_timestamp: string; new_timestamp: string }) => post<{ ok: boolean; pending?: boolean }>('/api/edit', body),
  delete: (body: { emp_id: string; name: string; dept: string; timestamp: string }) => post<{ ok: boolean; pending?: boolean }>('/api/delete', body),
  bulkDelete: (items: { emp_id: string; name: string; dept: string; timestamp: string }[]) => post<{ ok: boolean }>('/api/bulk-delete', items),
  cancelMyPending: (id: string) => del<{ ok: boolean }>(`/api/my-pending/${id}`),
  changePassword: (current_password: string, new_password: string) => put<{ ok: boolean }>('/api/change-password', { current_password, new_password }),
  updateProfile: (data: { full_name?: string; email?: string; username?: string; current_password?: string; new_password?: string }) =>
    put<{ ok: boolean }>('/api/profile', data),
  appConfig: () => get<AppConfigResponse>('/api/app-config'),
  employeeReports: (empId: string) => get<ReportUrl[]>(`/api/employee-reports/${empId}`),
  reports: () => get<ReportIndex>('/api/reports'),
  report: (stem: string) => get<EmployeeReport>(`/api/reports/${stem}`),

  // Admin
  admin: {
    employees: () => get<Employee[]>('/api/admin/employees'),
    updateEmployee: (empId: string, data: Partial<Employee> & { password?: string }) => put<{ ok: boolean }>(`/api/admin/employees/${empId}`, data),
    admins: () => get<AdminAccount[]>('/api/admin/admins'),
    createAdmin: (username: string, password: string) => post<{ ok: boolean }>('/api/admin/admins', { username, password }),
    updateAdmin: (username: string, password: string) => put<{ ok: boolean }>(`/api/admin/admins/${username}`, { password }),
    deleteAdmin: (username: string) => del<{ ok: boolean }>(`/api/admin/admins/${username}`),
    rawFiles: () => get<RawFile[]>('/api/admin/raw-files'),
    uploadFile: async (file: File) => {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/admin/raw-files', { method: 'POST', body: form, credentials: 'same-origin' })
      const data = await res.json()
      if (!res.ok) throw new ApiError(res.status, data.error ?? res.statusText)
      return data as { ok: boolean; name: string }
    },
    deleteFile: (filename: string) => del<{ ok: boolean }>(`/api/admin/raw-files/${encodeURIComponent(filename)}`),
    getAppConfig: () => get<{ time_format?: string; theme?: string; favicon_ext?: string; date_format?: string }>('/api/admin/app-config'),
    updateAppConfig: (data: { time_format?: string; theme?: string; date_format?: string }) => put<{ ok: boolean }>('/api/admin/app-config', data),
    uploadFavicon: async (file: File) => {
      const form = new FormData()
      form.append('favicon', file)
      const res = await fetch('/api/admin/app-config/favicon', { method: 'POST', body: form, credentials: 'same-origin' })
      const data = await res.json()
      if (!res.ok) throw new ApiError(res.status, (data as any).error ?? res.statusText)
      return data as { ok: boolean; ext: string }
    },
    pending: () => get<PendingItem[]>('/api/admin/pending'),
    pendingPreview: (id: string) => get<{ ok: boolean } & PreviewResult>(`/api/admin/pending/${id}/preview`),
    approvePending: (id: string) => post<{ ok: boolean }>(`/api/admin/pending/${id}/approve`, {}),
    rejectPending: (id: string) => post<{ ok: boolean }>(`/api/admin/pending/${id}/reject`, {}),
  },
}
