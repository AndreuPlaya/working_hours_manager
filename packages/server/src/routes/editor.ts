import { Hono } from 'hono'
import {
  bulkDelete,
  cancelMyPending,
  canSubmitCorrectionFor,
  getMyPending,
  submitCorrection,
} from '../application/correctionService.js'
import {
  canAccessReport,
  getEmployeeReport,
  getEmployeeReportUrls,
  getEventsData,
  getReportIndex,
} from '../application/reportService.js'
import {
  changePassword,
  ERR_MISSING,
  ERR_NOT_FOUND,
  ERR_USERNAME_TAKEN,
  ERR_WRONG_PW,
  getProfiles,
  getUserConfig,
  updateProfile,
} from '../application/userService.js'
import { getAppConfig } from '../application/appConfigService.js'
import { adminMiddleware, authMiddleware } from '../middleware/auth.js'

const editor = new Hono()

editor.use('/api/*', authMiddleware)

editor.get('/api/events', c => {
  const user = c.get('user')
  return c.json(getEventsData(user.empId, user.isAdmin))
})

editor.get('/api/profiles', c => c.json(getProfiles()))

editor.get('/api/config', c => {
  const user = c.get('user')
  const profile = user.empId ? getUserConfig(user.empId) : {}
  return c.json({ username: user.username, is_admin: user.isAdmin, emp_id: user.empId, restrict_edits: !user.isAdmin, ...profile })
})

editor.get('/api/app-config', c => {
  const cfg = getAppConfig()
  return c.json({ theme: cfg.theme ?? 'blue', time_format: cfg.time_format ?? '24h', date_format: cfg.date_format ?? 'MM/dd(ddd)' })
})

editor.get('/api/my-reports', c => {
  const user = c.get('user')
  if (!user.empId) return c.json([])
  return c.json(getEmployeeReportUrls(user.empId))
})

editor.get('/api/my-pending', c => {
  const user = c.get('user')
  return c.json(getMyPending(user.empId, user.isAdmin))
})

editor.delete('/api/my-pending/:id', c => {
  const user = c.get('user')
  const result = cancelMyPending(c.req.param('id'), user.username, user.isAdmin)
  if (result === 'not_found') return c.json({ ok: false, error: 'Not found.' }, 404)
  if (result === 'denied') return c.json({ ok: false, error: 'Access denied.' }, 403)
  return c.json({ ok: true })
})

editor.get('/api/reports', adminMiddleware, c => c.json(getReportIndex()))

editor.get('/api/reports/:stem', c => {
  const user = c.get('user')
  const stem = c.req.param('stem')
  if (!canAccessReport(stem, user.empId, user.isAdmin)) {
    return c.json({ ok: false, error: 'Access denied.' }, 403)
  }
  const data = getEmployeeReport(stem)
  if (!data) return c.json({ ok: false, error: 'Report not found.' }, 404)
  return c.json(data)
})

editor.get('/api/employee-reports/:empId', adminMiddleware, c => {
  return c.json(getEmployeeReportUrls(c.req.param('empId')))
})

editor.put('/api/profile', async c => {
  const user = c.get('user')
  if (!user.empId) return c.json({ ok: false, error: 'Profile editing is only available for employees.' }, 403)
  const data = await c.req.json<{ full_name?: string; email?: string; username?: string; current_password?: string; new_password?: string }>()
  const err = updateProfile(user.username, data)
  if (err === ERR_NOT_FOUND) return c.json({ ok: false, error: 'User not found.' }, 404)
  if (err === ERR_WRONG_PW) return c.json({ ok: false, error: 'Current password is incorrect.' }, 401)
  if (err === ERR_USERNAME_TAKEN) return c.json({ ok: false, error: 'Username already taken.' }, 409)
  return c.json({ ok: true })
})

editor.put('/api/change-password', async c => {
  const user = c.get('user')
  const { current_password = '', new_password = '' } = await c.req.json<{ current_password: string; new_password: string }>()
  const err = changePassword(user.username, current_password, new_password)
  if (err === ERR_MISSING) return c.json({ ok: false, error: 'Current and new passwords are required.' }, 400)
  if (err === ERR_NOT_FOUND) return c.json({ ok: false, error: 'User not found.' }, 404)
  if (err === ERR_WRONG_PW) return c.json({ ok: false, error: 'Current password is incorrect.' }, 401)
  return c.json({ ok: true })
})

editor.post('/api/add', async c => {
  const user = c.get('user')
  const d = await c.req.json<{ emp_id: string; name: string; dept: string; timestamp: string }>()
  if (!canSubmitCorrectionFor(d.emp_id, user.empId, user.isAdmin)) {
    return c.json({ ok: false, error: 'Access denied.' }, 403)
  }
  const pending = submitCorrection('ADD', d.emp_id, d.name, d.dept, d.timestamp, null, user.username, user.isAdmin)
  return c.json({ ok: true, ...(pending && { pending: true }) })
})

editor.post('/api/edit', async c => {
  const user = c.get('user')
  const d = await c.req.json<{ emp_id: string; name: string; dept: string; old_timestamp: string; new_timestamp: string }>()
  if (!canSubmitCorrectionFor(d.emp_id, user.empId, user.isAdmin)) {
    return c.json({ ok: false, error: 'Access denied.' }, 403)
  }
  const pending = submitCorrection('EDIT', d.emp_id, d.name, d.dept, d.old_timestamp, d.new_timestamp, user.username, user.isAdmin)
  return c.json({ ok: true, ...(pending && { pending: true }) })
})

editor.post('/api/delete', async c => {
  const user = c.get('user')
  const d = await c.req.json<{ emp_id: string; name: string; dept: string; timestamp: string }>()
  if (!canSubmitCorrectionFor(d.emp_id, user.empId, user.isAdmin)) {
    return c.json({ ok: false, error: 'Access denied.' }, 403)
  }
  const pending = submitCorrection('DEL', d.emp_id, d.name, d.dept, d.timestamp, null, user.username, user.isAdmin)
  return c.json({ ok: true, ...(pending && { pending: true }) })
})

editor.post('/api/bulk-delete', adminMiddleware, async c => {
  bulkDelete(await c.req.json(), c.get('user').username)
  return c.json({ ok: true })
})

export default editor
