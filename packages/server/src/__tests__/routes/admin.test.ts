import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../application/correctionService.js')
vi.mock('../../application/fileService.js')
vi.mock('../../application/reportService.js')
vi.mock('../../application/userService.js')
vi.mock('../../infrastructure/settings.js')

import { approvePending, getPending, rejectPending } from '../../application/correctionService.js'
import { deleteRawFile, listRawFiles, saveRawFile } from '../../application/fileService.js'
import { getEmployeeList, getPendingPreview } from '../../application/reportService.js'
import {
  createAdmin,
  deleteAdmin,
  ERR_MISSING,
  ERR_NOT_FOUND,
  listAdmins,
  updateAdminPassword,
  updateEmployee,
} from '../../application/userService.js'
import { ensureSecretKey } from '../../infrastructure/settings.js'
import { SignJWT } from 'jose'
import adminRoutes from '../../routes/admin.js'
import type { PendingItem } from '../../infrastructure/data.js'

const mockEnsureKey = vi.mocked(ensureSecretKey)
const mockGetEmployeeList = vi.mocked(getEmployeeList)
const mockUpdateEmployee = vi.mocked(updateEmployee)
const mockListAdmins = vi.mocked(listAdmins)
const mockCreateAdmin = vi.mocked(createAdmin)
const mockUpdateAdminPassword = vi.mocked(updateAdminPassword)
const mockDeleteAdmin = vi.mocked(deleteAdmin)
const mockListRawFiles = vi.mocked(listRawFiles)
const mockSaveRawFile = vi.mocked(saveRawFile)
const mockDeleteRawFile = vi.mocked(deleteRawFile)
const mockGetPending = vi.mocked(getPending)
const mockGetPendingPreview = vi.mocked(getPendingPreview)
const mockApprovePending = vi.mocked(approvePending)
const mockRejectPending = vi.mocked(rejectPending)

const TEST_SECRET = 'test-secret-admin-routes'

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

async function empHeaders(): Promise<Record<string, string>> {
  const token = await makeToken('alice', false, '1')
  return { Cookie: `session=${token}` }
}

beforeEach(() => {
  vi.resetAllMocks()
  mockEnsureKey.mockReturnValue(TEST_SECRET)
  mockGetEmployeeList.mockReturnValue([])
  mockListAdmins.mockReturnValue([])
  mockListRawFiles.mockReturnValue([])
  mockGetPending.mockReturnValue([])
  mockSaveRawFile.mockReturnValue({ ok: true, error: '' })
  mockDeleteRawFile.mockReturnValue({ ok: true, error: '' })
  mockUpdateEmployee.mockReturnValue(null)
  mockCreateAdmin.mockReturnValue(null)
  mockUpdateAdminPassword.mockReturnValue(null)
  mockDeleteAdmin.mockReturnValue(null)
  mockApprovePending.mockReturnValue(true)
  mockRejectPending.mockReturnValue(true)
})

// ---------------------------------------------------------------------------
// Access control (middleware)
// ---------------------------------------------------------------------------

describe('admin access control', () => {
  it('returns 403 for non-admin accessing any admin route', async () => {
    const res = await adminRoutes.request('/api/admin/employees', { headers: await empHeaders() })
    expect(res.status).toBe(403)
  })
})

// ---------------------------------------------------------------------------
// GET /api/admin/employees
// ---------------------------------------------------------------------------

describe('GET /api/admin/employees', () => {
  it('returns employee list', async () => {
    mockGetEmployeeList.mockReturnValue([{ emp_id: '1' }])
    const res = await adminRoutes.request('/api/admin/employees', { headers: await adminHeaders() })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([{ emp_id: '1' }])
  })
})

// ---------------------------------------------------------------------------
// PUT /api/admin/employees/:empId
// ---------------------------------------------------------------------------

describe('PUT /api/admin/employees/:empId', () => {
  it('returns 409 when username is taken', async () => {
    mockUpdateEmployee.mockReturnValue('USERNAME_TAKEN')
    const res = await adminRoutes.request('/api/admin/employees/1', {
      method: 'PUT',
      headers: { ...(await adminHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'taken' }),
    })
    expect(res.status).toBe(409)
  })

  it('returns 200 on success', async () => {
    const res = await adminRoutes.request('/api/admin/employees/1', {
      method: 'PUT',
      headers: { ...(await adminHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ alias: 'Al' }),
    })
    expect(res.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// GET /api/admin/admins
// ---------------------------------------------------------------------------

describe('GET /api/admin/admins', () => {
  it('returns admin list', async () => {
    mockListAdmins.mockReturnValue([{ username: 'admin' }])
    const res = await adminRoutes.request('/api/admin/admins', { headers: await adminHeaders() })
    expect(await res.json()).toEqual([{ username: 'admin' }])
  })
})

// ---------------------------------------------------------------------------
// POST /api/admin/admins
// ---------------------------------------------------------------------------

describe('POST /api/admin/admins', () => {
  it('returns 400 for missing fields', async () => {
    mockCreateAdmin.mockReturnValue(ERR_MISSING)
    const res = await adminRoutes.request('/api/admin/admins', {
      method: 'POST',
      headers: { ...(await adminHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '', password: '' }),
    })
    expect(res.status).toBe(400)
  })

  it('returns 409 when username already exists', async () => {
    mockCreateAdmin.mockReturnValue('USERNAME_TAKEN')
    const res = await adminRoutes.request('/api/admin/admins', {
      method: 'POST',
      headers: { ...(await adminHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'existing', password: 'pass' }),
    })
    expect(res.status).toBe(409)
  })

  it('returns 200 on success', async () => {
    const res = await adminRoutes.request('/api/admin/admins', {
      method: 'POST',
      headers: { ...(await adminHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'newadmin', password: 'pass' }),
    })
    expect(res.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// PUT /api/admin/admins/:username
// ---------------------------------------------------------------------------

describe('PUT /api/admin/admins/:username', () => {
  it('returns 404 when admin not found', async () => {
    mockUpdateAdminPassword.mockReturnValue(ERR_NOT_FOUND)
    const res = await adminRoutes.request('/api/admin/admins/ghost', {
      method: 'PUT',
      headers: { ...(await adminHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'newpass' }),
    })
    expect(res.status).toBe(404)
  })

  it('returns 200 on success', async () => {
    const res = await adminRoutes.request('/api/admin/admins/admin', {
      method: 'PUT',
      headers: { ...(await adminHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'newpass' }),
    })
    expect(res.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// DELETE /api/admin/admins/:username
// ---------------------------------------------------------------------------

describe('DELETE /api/admin/admins/:username', () => {
  it('returns 403 for PROTECTED', async () => {
    mockDeleteAdmin.mockReturnValue('PROTECTED')
    const res = await adminRoutes.request('/api/admin/admins/admin', {
      method: 'DELETE',
      headers: await adminHeaders(),
    })
    expect(res.status).toBe(403)
  })

  it('returns 400 for SELF_DELETE', async () => {
    mockDeleteAdmin.mockReturnValue('SELF_DELETE')
    const res = await adminRoutes.request('/api/admin/admins/admin', {
      method: 'DELETE',
      headers: await adminHeaders(),
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 when admin not found', async () => {
    mockDeleteAdmin.mockReturnValue(ERR_NOT_FOUND)
    const res = await adminRoutes.request('/api/admin/admins/ghost', {
      method: 'DELETE',
      headers: await adminHeaders(),
    })
    expect(res.status).toBe(404)
  })

  it('returns 200 on success', async () => {
    const res = await adminRoutes.request('/api/admin/admins/ops', {
      method: 'DELETE',
      headers: await adminHeaders(),
    })
    expect(res.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// GET /api/admin/raw-files
// ---------------------------------------------------------------------------

describe('GET /api/admin/raw-files', () => {
  it('returns file list', async () => {
    mockListRawFiles.mockReturnValue([{ name: 'data.txt', size: 100, modified: 1700000000 }])
    const res = await adminRoutes.request('/api/admin/raw-files', { headers: await adminHeaders() })
    expect(res.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// POST /api/admin/raw-files
// ---------------------------------------------------------------------------

describe('POST /api/admin/raw-files', () => {
  it('returns 400 when no file is provided in body', async () => {
    const res = await adminRoutes.request('/api/admin/raw-files', {
      method: 'POST',
      headers: { ...(await adminHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('No file provided.')
  })

  it('returns 400 when the file field is a string (not a File object)', async () => {
    // FormData text field (not a Blob/File) makes parseBody() return a plain string
    const formData = new FormData()
    formData.append('file', 'just-a-text-value')
    const res = await adminRoutes.request('/api/admin/raw-files', {
      method: 'POST',
      headers: await adminHeaders(),
      body: formData,
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('No file provided.')
  })

  it('returns 400 when filename is invalid (No filename.)', async () => {
    mockSaveRawFile.mockReturnValue({ ok: false, error: 'No filename.' })
    const formData = new FormData()
    formData.append('file', new File(['content'], 'data.txt', { type: 'text/plain' }))
    const res = await adminRoutes.request('/api/admin/raw-files', {
      method: 'POST',
      headers: await adminHeaders(),
      body: formData,
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when file extension is invalid', async () => {
    mockSaveRawFile.mockReturnValue({ ok: false, error: 'Only .txt files are accepted.' })
    const formData = new FormData()
    formData.append('file', new File(['content'], 'data.csv', { type: 'text/csv' }))
    const res = await adminRoutes.request('/api/admin/raw-files', {
      method: 'POST',
      headers: await adminHeaders(),
      body: formData,
    })
    expect(res.status).toBe(400)
  })

  it('returns 422 when content validation fails', async () => {
    mockSaveRawFile.mockReturnValue({ ok: false, error: 'No valid clock events found.' })
    const formData = new FormData()
    formData.append('file', new File(['bad'], 'data.txt', { type: 'text/plain' }))
    const res = await adminRoutes.request('/api/admin/raw-files', {
      method: 'POST',
      headers: await adminHeaders(),
      body: formData,
    })
    expect(res.status).toBe(422)
  })

  it('returns 200 on successful upload', async () => {
    const formData = new FormData()
    formData.append('file', new File(['1\tAlice\tAdmin\t2024-01-15 09:00:00'], 'data.txt', { type: 'text/plain' }))
    const res = await adminRoutes.request('/api/admin/raw-files', {
      method: 'POST',
      headers: await adminHeaders(),
      body: formData,
    })
    expect(res.status).toBe(200)
    expect((await res.json()).ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// DELETE /api/admin/raw-files/:filename
// ---------------------------------------------------------------------------

describe('DELETE /api/admin/raw-files/:filename', () => {
  it('returns 400 for invalid file type', async () => {
    mockDeleteRawFile.mockReturnValue({ ok: false, error: 'Invalid file.' })
    const res = await adminRoutes.request('/api/admin/raw-files/data.csv', {
      method: 'DELETE',
      headers: await adminHeaders(),
    })
    expect(res.status).toBe(400)
  })

  it('returns 404 when file is not found', async () => {
    mockDeleteRawFile.mockReturnValue({ ok: false, error: 'File not found.' })
    const res = await adminRoutes.request('/api/admin/raw-files/missing.txt', {
      method: 'DELETE',
      headers: await adminHeaders(),
    })
    expect(res.status).toBe(404)
  })

  it('returns 200 on success', async () => {
    const res = await adminRoutes.request('/api/admin/raw-files/data.txt', {
      method: 'DELETE',
      headers: await adminHeaders(),
    })
    expect(res.status).toBe(200)
  })
})

// ---------------------------------------------------------------------------
// GET /api/admin/pending
// ---------------------------------------------------------------------------

describe('GET /api/admin/pending', () => {
  it('returns pending list', async () => {
    const items: PendingItem[] = [{ id: '1', action: 'ADD', emp_id: '1', name: 'A', dept: 'D', timestamp: 't', new_timestamp: null, submitted_at: 's', submitted_by: 'u' }]
    mockGetPending.mockReturnValue(items)
    const res = await adminRoutes.request('/api/admin/pending', { headers: await adminHeaders() })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(items)
  })
})

// ---------------------------------------------------------------------------
// GET /api/admin/pending/:id/preview
// ---------------------------------------------------------------------------

describe('GET /api/admin/pending/:id/preview', () => {
  const item: PendingItem = { id: 'abc', action: 'ADD', emp_id: '1', name: 'A', dept: 'D', timestamp: '2024-01-15 09:00:00', new_timestamp: null, submitted_at: 's', submitted_by: 'u' }

  it('returns 404 when pending item is not found', async () => {
    mockGetPending.mockReturnValue([])
    const res = await adminRoutes.request('/api/admin/pending/abc/preview', { headers: await adminHeaders() })
    expect(res.status).toBe(404)
  })

  it('returns 400 when preview cannot be computed', async () => {
    mockGetPending.mockReturnValue([item])
    mockGetPendingPreview.mockReturnValue(null)
    const res = await adminRoutes.request('/api/admin/pending/abc/preview', { headers: await adminHeaders() })
    expect(res.status).toBe(400)
  })

  it('returns 200 with preview data on success', async () => {
    mockGetPending.mockReturnValue([item])
    mockGetPendingPreview.mockReturnValue({ employee: 'A', before: {}, after: {} })
    const res = await adminRoutes.request('/api/admin/pending/abc/preview', { headers: await adminHeaders() })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
    expect(body.employee).toBe('A')
  })
})

// ---------------------------------------------------------------------------
// POST /api/admin/pending/:id/approve
// ---------------------------------------------------------------------------

describe('POST /api/admin/pending/:id/approve', () => {
  it('returns 404 when pending item is not found', async () => {
    mockApprovePending.mockReturnValue(false)
    const res = await adminRoutes.request('/api/admin/pending/missing/approve', {
      method: 'POST',
      headers: await adminHeaders(),
    })
    expect(res.status).toBe(404)
  })

  it('returns 200 on successful approval', async () => {
    const res = await adminRoutes.request('/api/admin/pending/abc/approve', {
      method: 'POST',
      headers: await adminHeaders(),
    })
    expect(res.status).toBe(200)
    expect(mockApprovePending).toHaveBeenCalledWith('abc')
  })
})

// ---------------------------------------------------------------------------
// POST /api/admin/pending/:id/reject
// ---------------------------------------------------------------------------

describe('POST /api/admin/pending/:id/reject', () => {
  it('returns 404 when pending item is not found', async () => {
    mockRejectPending.mockReturnValue(false)
    const res = await adminRoutes.request('/api/admin/pending/missing/reject', {
      method: 'POST',
      headers: await adminHeaders(),
    })
    expect(res.status).toBe(404)
  })

  it('returns 200 on successful rejection', async () => {
    const res = await adminRoutes.request('/api/admin/pending/abc/reject', {
      method: 'POST',
      headers: await adminHeaders(),
    })
    expect(res.status).toBe(200)
    expect(mockRejectPending).toHaveBeenCalledWith('abc')
  })
})
