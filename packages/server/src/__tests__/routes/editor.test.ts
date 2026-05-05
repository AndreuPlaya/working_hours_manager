import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../application/correctionService.js')
vi.mock('../../application/reportService.js')
vi.mock('../../application/userService.js')
vi.mock('../../infrastructure/settings.js')

import {
  addCorrection,
  bulkDelete,
  deleteCorrection,
  editCorrection,
  getPending,
  queueCorrection,
} from '../../application/correctionService.js'
import {
  getEmployeeReport,
  getEmployeeReportUrls,
  getEventsData,
  getReportIndex,
} from '../../application/reportService.js'
import { changePassword, ERR_MISSING, ERR_NOT_FOUND, ERR_USERNAME_TAKEN, ERR_WRONG_PW, getProfiles, updateProfile } from '../../application/userService.js'
import { ensureSecretKey, loadAppConfig, loadSettings } from '../../infrastructure/settings.js'
import { SignJWT } from 'jose'
import editorRoutes from '../../routes/editor.js'
import type { PendingItem } from '../../infrastructure/data.js'

const mockEnsureKey = vi.mocked(ensureSecretKey)
const mockGetEventsData = vi.mocked(getEventsData)
const mockGetProfiles = vi.mocked(getProfiles)
const mockGetReportIndex = vi.mocked(getReportIndex)
const mockGetEmployeeReport = vi.mocked(getEmployeeReport)
const mockGetEmployeeReportUrls = vi.mocked(getEmployeeReportUrls)
const mockGetPending = vi.mocked(getPending)
const mockChangePassword = vi.mocked(changePassword)
const mockUpdateProfile = vi.mocked(updateProfile)
const mockLoadAppConfig = vi.mocked(loadAppConfig)
const mockLoadSettings = vi.mocked(loadSettings)
const mockAddCorrection = vi.mocked(addCorrection)
const mockEditCorrection = vi.mocked(editCorrection)
const mockDeleteCorrection = vi.mocked(deleteCorrection)
const mockBulkDelete = vi.mocked(bulkDelete)
const mockQueueCorrection = vi.mocked(queueCorrection)

const TEST_SECRET = 'test-secret-editor-routes'

async function makeToken(username: string, isAdmin: boolean, empId: string | null): Promise<string> {
  const secret = new TextEncoder().encode(TEST_SECRET)
  return new SignJWT({ username, isAdmin, empId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secret)
}

async function adminHeaders(): Promise<Record<string, string>> {
  const token = await makeToken('admin', true, null)
  return { Cookie: `session=${token}` }
}

async function empHeaders(empId: string): Promise<Record<string, string>> {
  const token = await makeToken('alice', false, empId)
  return { Cookie: `session=${token}` }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockEnsureKey.mockReturnValue(TEST_SECRET)
  mockGetEventsData.mockReturnValue({})
  mockGetProfiles.mockReturnValue({})
  mockGetReportIndex.mockReturnValue({ years: [], stems_by_year: {} })
  mockGetEmployeeReport.mockReturnValue(null)
  mockGetEmployeeReportUrls.mockReturnValue([])
  mockGetPending.mockReturnValue([])
  mockChangePassword.mockReturnValue(null)
  mockUpdateProfile.mockReturnValue(null)
  mockLoadAppConfig.mockReturnValue({ time_format: '24h', theme: 'blue' })
  mockLoadSettings.mockReturnValue({ employees: {}, admin_users: {}, secret_key: TEST_SECRET })
})

// ---------------------------------------------------------------------------
// GET /api/events
// ---------------------------------------------------------------------------

describe('GET /api/events', () => {
  it('returns 401 without authentication', async () => {
    const res = await editorRoutes.request('/api/events')
    expect(res.status).toBe(401)
  })

  it('returns events data for admin', async () => {
    mockGetEventsData.mockReturnValue({ key: [] })
    const res = await editorRoutes.request('/api/events', { headers: await adminHeaders() })
    expect(res.status).toBe(200)
    expect(mockGetEventsData).toHaveBeenCalledWith(null, true)
  })

  it('returns events data filtered for employee', async () => {
    const res = await editorRoutes.request('/api/events', { headers: await empHeaders('1') })
    expect(res.status).toBe(200)
    expect(mockGetEventsData).toHaveBeenCalledWith('1', false)
  })
})

// ---------------------------------------------------------------------------
// GET /api/profiles
// ---------------------------------------------------------------------------

describe('GET /api/profiles', () => {
  it('returns profiles', async () => {
    mockGetProfiles.mockReturnValue({ '1': { alias: 'Al', full_name: 'Alice' } })
    const res = await editorRoutes.request('/api/profiles', { headers: await adminHeaders() })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ '1': { alias: 'Al', full_name: 'Alice' } })
  })
})

// ---------------------------------------------------------------------------
// GET /api/config
// ---------------------------------------------------------------------------

describe('GET /api/config', () => {
  it('returns user config for admin', async () => {
    const res = await editorRoutes.request('/api/config', { headers: await adminHeaders() })
    const body = await res.json()
    expect(body.username).toBe('admin')
    expect(body.is_admin).toBe(true)
    expect(body.restrict_edits).toBe(false)
  })

  it('returns restrict_edits=true for employee', async () => {
    const res = await editorRoutes.request('/api/config', { headers: await empHeaders('1') })
    const body = await res.json()
    expect(body.restrict_edits).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// GET /api/my-reports
// ---------------------------------------------------------------------------

describe('GET /api/my-reports', () => {
  it('returns empty array for admin (no empId)', async () => {
    const res = await editorRoutes.request('/api/my-reports', { headers: await adminHeaders() })
    expect(await res.json()).toEqual([])
    expect(mockGetEmployeeReportUrls).not.toHaveBeenCalled()
  })

  it('returns report URLs for employee', async () => {
    mockGetEmployeeReportUrls.mockReturnValue([{ stem: '2024-1-alice', year: 2024, url: '/reports/2024-1-alice' }])
    const res = await editorRoutes.request('/api/my-reports', { headers: await empHeaders('1') })
    expect(mockGetEmployeeReportUrls).toHaveBeenCalledWith('1')
    expect(res.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// GET /api/my-pending
// ---------------------------------------------------------------------------

describe('GET /api/my-pending', () => {
  const pendingItems: PendingItem[] = [
    { id: '1', action: 'ADD', emp_id: '1', name: 'A', dept: 'D', timestamp: 't', new_timestamp: null, submitted_at: 's', submitted_by: 'u' },
    { id: '2', action: 'ADD', emp_id: '2', name: 'B', dept: 'D', timestamp: 't', new_timestamp: null, submitted_at: 's', submitted_by: 'u' },
  ]

  it('returns all pending items for admin', async () => {
    mockGetPending.mockReturnValue(pendingItems)
    const res = await editorRoutes.request('/api/my-pending', { headers: await adminHeaders() })
    const body = await res.json()
    expect(body).toHaveLength(2)
  })

  it('filters pending items to own empId for employee', async () => {
    mockGetPending.mockReturnValue(pendingItems)
    const res = await editorRoutes.request('/api/my-pending', { headers: await empHeaders('1') })
    const body = await res.json()
    expect(body).toHaveLength(1)
    expect(body[0].emp_id).toBe('1')
  })
})

// ---------------------------------------------------------------------------
// GET /api/reports (admin only)
// ---------------------------------------------------------------------------

describe('GET /api/reports', () => {
  it('returns 403 for non-admin', async () => {
    const res = await editorRoutes.request('/api/reports', { headers: await empHeaders('1') })
    expect(res.status).toBe(403)
  })

  it('returns report index for admin', async () => {
    mockGetReportIndex.mockReturnValue({ years: ['2024'], stems_by_year: {} })
    const res = await editorRoutes.request('/api/reports', { headers: await adminHeaders() })
    expect(res.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// GET /api/reports/:stem
// ---------------------------------------------------------------------------

describe('GET /api/reports/:stem', () => {
  it('returns 403 for non-admin accessing a different employee stem', async () => {
    const res = await editorRoutes.request('/api/reports/2024-2-alice', { headers: await empHeaders('1') })
    expect(res.status).toBe(403)
  })

  it('returns 403 when stem has fewer than 3 parts for non-admin', async () => {
    const res = await editorRoutes.request('/api/reports/2024-1', { headers: await empHeaders('1') })
    expect(res.status).toBe(403)
  })

  it('returns 404 when report is not found (null from service)', async () => {
    mockGetEmployeeReport.mockReturnValue(null)
    const res = await editorRoutes.request('/api/reports/2024-1-alice', { headers: await empHeaders('1') })
    expect(res.status).toBe(404)
  })

  it('returns the report for a non-admin accessing own empId', async () => {
    mockGetEmployeeReport.mockReturnValue({ name: 'Alice', dept: 'Admin', emp_id: '1', year: 2024, months: [], year_total: '0h 00m' })
    const res = await editorRoutes.request('/api/reports/2024-1-alice', { headers: await empHeaders('1') })
    expect(res.status).toBe(200)
  })

  it('returns the report for an admin regardless of stem', async () => {
    mockGetEmployeeReport.mockReturnValue({ name: 'Bob', dept: 'HR', emp_id: '2', year: 2024, months: [], year_total: '0h 00m' })
    const res = await editorRoutes.request('/api/reports/2024-2-bob', { headers: await adminHeaders() })
    expect(res.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// GET /api/employee-reports/:empId (admin only)
// ---------------------------------------------------------------------------

describe('GET /api/employee-reports/:empId', () => {
  it('returns 403 for non-admin', async () => {
    const res = await editorRoutes.request('/api/employee-reports/1', { headers: await empHeaders('1') })
    expect(res.status).toBe(403)
  })

  it('returns URLs for admin', async () => {
    mockGetEmployeeReportUrls.mockReturnValue([])
    const res = await editorRoutes.request('/api/employee-reports/1', { headers: await adminHeaders() })
    expect(res.status).toBe(200)
    expect(mockGetEmployeeReportUrls).toHaveBeenCalledWith('1')
  })
})

// ---------------------------------------------------------------------------
// PUT /api/change-password
// ---------------------------------------------------------------------------

describe('PUT /api/change-password', () => {
  it('returns 400 for missing fields', async () => {
    mockChangePassword.mockReturnValue(ERR_MISSING)
    const res = await editorRoutes.request('/api/change-password', {
      method: 'PUT',
      headers: { ...(await adminHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: '', new_password: '' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 when user is not found', async () => {
    mockChangePassword.mockReturnValue(ERR_NOT_FOUND)
    const res = await editorRoutes.request('/api/change-password', {
      method: 'PUT',
      headers: { ...(await adminHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: 'old', new_password: 'new' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 401 for wrong current password', async () => {
    mockChangePassword.mockReturnValue(ERR_WRONG_PW)
    const res = await editorRoutes.request('/api/change-password', {
      method: 'PUT',
      headers: { ...(await adminHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: 'wrong', new_password: 'new' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 200 on success', async () => {
    mockChangePassword.mockReturnValue(null)
    const res = await editorRoutes.request('/api/change-password', {
      method: 'PUT',
      headers: { ...(await adminHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ current_password: 'old', new_password: 'new' }),
    })
    expect(res.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// POST /api/add
// ---------------------------------------------------------------------------

describe('POST /api/add', () => {
  const payload = { emp_id: '1', name: 'Alice', dept: 'Admin', timestamp: '2024-01-15 09:00:00' }

  it('returns 403 when non-admin tries to add for a different employee', async () => {
    const res = await editorRoutes.request('/api/add', {
      method: 'POST',
      headers: { ...(await empHeaders('2')), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    expect(res.status).toBe(403)
  })

  it('calls addCorrection directly for admin and returns ok', async () => {
    const res = await editorRoutes.request('/api/add', {
      method: 'POST',
      headers: { ...(await adminHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    expect(res.status).toBe(200)
    expect(mockAddCorrection).toHaveBeenCalled()
    expect(mockQueueCorrection).not.toHaveBeenCalled()
  })

  it('queues the correction for a non-admin adding their own event', async () => {
    const res = await editorRoutes.request('/api/add', {
      method: 'POST',
      headers: { ...(await empHeaders('1')), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending).toBe(true)
    expect(mockQueueCorrection).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// POST /api/edit
// ---------------------------------------------------------------------------

describe('POST /api/edit', () => {
  const payload = { emp_id: '1', name: 'Alice', dept: 'Admin', old_timestamp: '2024-01-15 09:00:00', new_timestamp: '2024-01-15 09:05:00' }

  it('returns 403 for non-admin editing a different employee', async () => {
    const res = await editorRoutes.request('/api/edit', {
      method: 'POST',
      headers: { ...(await empHeaders('2')), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    expect(res.status).toBe(403)
  })

  it('calls editCorrection directly for admin', async () => {
    const res = await editorRoutes.request('/api/edit', {
      method: 'POST',
      headers: { ...(await adminHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    expect(res.status).toBe(200)
    expect(mockEditCorrection).toHaveBeenCalled()
  })

  it('queues the edit correction for employee', async () => {
    const res = await editorRoutes.request('/api/edit', {
      method: 'POST',
      headers: { ...(await empHeaders('1')), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const body = await res.json()
    expect(body.pending).toBe(true)
    expect(mockQueueCorrection).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// POST /api/delete
// ---------------------------------------------------------------------------

describe('POST /api/delete', () => {
  const payload = { emp_id: '1', name: 'Alice', dept: 'Admin', timestamp: '2024-01-15 09:00:00' }

  it('returns 403 when non-admin tries to delete a different employee', async () => {
    const res = await editorRoutes.request('/api/delete', {
      method: 'POST',
      headers: { ...(await empHeaders('2')), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    expect(res.status).toBe(403)
  })

  it('calls deleteCorrection directly for admin', async () => {
    const res = await editorRoutes.request('/api/delete', {
      method: 'POST',
      headers: { ...(await adminHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    expect(res.status).toBe(200)
    expect(mockDeleteCorrection).toHaveBeenCalled()
    expect(mockQueueCorrection).not.toHaveBeenCalled()
  })

  it('queues DEL correction for employee deleting their own session', async () => {
    const res = await editorRoutes.request('/api/delete', {
      method: 'POST',
      headers: { ...(await empHeaders('1')), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.pending).toBe(true)
    expect(mockQueueCorrection).toHaveBeenCalledWith('DEL', '1', 'Alice', 'Admin', '2024-01-15 09:00:00', null, 'alice')
    expect(mockDeleteCorrection).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// POST /api/bulk-delete (admin only)
// ---------------------------------------------------------------------------

describe('POST /api/bulk-delete', () => {
  const payload = [{ emp_id: '1', name: 'Alice', dept: 'Admin', timestamp: '2024-01-15 09:00:00' }]

  it('returns 403 for non-admin', async () => {
    const res = await editorRoutes.request('/api/bulk-delete', {
      method: 'POST',
      headers: { ...(await empHeaders('1')), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    expect(res.status).toBe(403)
  })

  it('calls bulkDelete for admin', async () => {
    const res = await editorRoutes.request('/api/bulk-delete', {
      method: 'POST',
      headers: { ...(await adminHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    expect(res.status).toBe(200)
    expect(mockBulkDelete).toHaveBeenCalledWith(payload)
  })
})

// ---------------------------------------------------------------------------
// DELETE /api/my-pending/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/my-pending/:id', () => {
  const item: PendingItem = { id: 'abc', action: 'ADD', emp_id: '1', name: 'Alice', dept: 'Admin', timestamp: 't', new_timestamp: null, submitted_at: 's', submitted_by: 'alice' }

  it('returns 404 when pending item is not found', async () => {
    mockGetPending.mockReturnValue([])
    const res = await editorRoutes.request('/api/my-pending/missing', { method: 'DELETE', headers: await empHeaders('1') })
    expect(res.status).toBe(404)
  })

  it('returns 403 when non-owner tries to cancel', async () => {
    mockGetPending.mockReturnValue([item])
    const token = await makeToken('other', false, '2')
    const res = await editorRoutes.request('/api/my-pending/abc', { method: 'DELETE', headers: { Cookie: `session=${token}` } })
    expect(res.status).toBe(403)
  })

  it('allows owner to cancel their own pending item', async () => {
    mockGetPending.mockReturnValue([item])
    const res = await editorRoutes.request('/api/my-pending/abc', { method: 'DELETE', headers: await empHeaders('1') })
    expect(res.status).toBe(200)
  })

  it('allows admin to cancel any pending item', async () => {
    mockGetPending.mockReturnValue([item])
    const res = await editorRoutes.request('/api/my-pending/abc', { method: 'DELETE', headers: await adminHeaders() })
    expect(res.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// GET /api/app-config
// ---------------------------------------------------------------------------

describe('GET /api/app-config', () => {
  it('returns defaults when no config is set', async () => {
    mockLoadAppConfig.mockReturnValue({})
    const res = await editorRoutes.request('/api/app-config', { headers: await empHeaders('1') })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.time_format).toBe('24h')
    expect(body.theme).toBe('blue')
  })

  it('returns stored time_format and theme', async () => {
    mockLoadAppConfig.mockReturnValue({ time_format: '12h', theme: 'green' })
    const res = await editorRoutes.request('/api/app-config', { headers: await adminHeaders() })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.time_format).toBe('12h')
    expect(body.theme).toBe('green')
  })
})

// ---------------------------------------------------------------------------
// GET /api/config (with full_name and email)
// ---------------------------------------------------------------------------

describe('GET /api/config (extended)', () => {
  it('returns full_name and email for employee', async () => {
    mockLoadSettings.mockReturnValue({
      employees: { '1': { alias: 'Al', full_name: 'Alice Smith', email: 'alice@example.com', username: 'alice', password_hash: '', is_admin: false, enabled: true } },
      admin_users: {},
      secret_key: TEST_SECRET,
    })
    const res = await editorRoutes.request('/api/config', { headers: await empHeaders('1') })
    const body = await res.json()
    expect(body.full_name).toBe('Alice Smith')
    expect(body.email).toBe('alice@example.com')
  })

  it('does not include full_name/email for pure admin', async () => {
    const res = await editorRoutes.request('/api/config', { headers: await adminHeaders() })
    const body = await res.json()
    expect(body.full_name).toBeUndefined()
    expect(body.email).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// PUT /api/profile
// ---------------------------------------------------------------------------

describe('PUT /api/profile', () => {
  const payload = { full_name: 'Alice Smith', email: 'alice@example.com', username: 'alice' }

  it('returns 403 for pure admin (no empId)', async () => {
    const res = await editorRoutes.request('/api/profile', {
      method: 'PUT',
      headers: { ...(await adminHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    expect(res.status).toBe(403)
  })

  it('returns 404 when user not found', async () => {
    mockUpdateProfile.mockReturnValue(ERR_NOT_FOUND)
    const res = await editorRoutes.request('/api/profile', {
      method: 'PUT',
      headers: { ...(await empHeaders('1')), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    expect(res.status).toBe(404)
  })

  it('returns 401 for wrong current password', async () => {
    mockUpdateProfile.mockReturnValue(ERR_WRONG_PW)
    const res = await editorRoutes.request('/api/profile', {
      method: 'PUT',
      headers: { ...(await empHeaders('1')), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, current_password: 'wrong', new_password: 'new' }),
    })
    expect(res.status).toBe(401)
  })

  it('returns 409 when username is taken', async () => {
    mockUpdateProfile.mockReturnValue(ERR_USERNAME_TAKEN)
    const res = await editorRoutes.request('/api/profile', {
      method: 'PUT',
      headers: { ...(await empHeaders('1')), 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, username: 'taken' }),
    })
    expect(res.status).toBe(409)
  })

  it('returns 200 on success and calls updateProfile', async () => {
    mockUpdateProfile.mockReturnValue(null)
    const res = await editorRoutes.request('/api/profile', {
      method: 'PUT',
      headers: { ...(await empHeaders('1')), 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    expect(res.status).toBe(200)
    expect(mockUpdateProfile).toHaveBeenCalledWith('alice', payload)
  })
})
