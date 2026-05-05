import { Hono } from 'hono'
import { addCorrection, bulkDelete, deleteCorrection, editCorrection, getPending, queueCorrection, rejectPending } from '../application/correctionService.js'
import { getEmployeeReport, getEmployeeReportUrls, getEventsData, getReportIndex } from '../application/reportService.js'
import { changePassword, ERR_MISSING, ERR_NOT_FOUND, ERR_USERNAME_TAKEN, ERR_WRONG_PW, getProfiles, updateProfile } from '../application/userService.js'
import { adminMiddleware, authMiddleware } from '../middleware/auth.js'
import { loadAppConfig, loadSettings } from '../infrastructure/settings.js'

const editor = new Hono()

editor.use('/api/*', authMiddleware)

editor.get('/api/events', c => {
  const user = c.get('user')
  return c.json(getEventsData(user.empId, user.isAdmin))
})

editor.get('/api/profiles', c => c.json(getProfiles()))

editor.get('/api/config', c => {
  const user = c.get('user')
  let full_name: string | undefined, email: string | undefined
  if (user.empId) {
    const emp = loadSettings().employees[user.empId]
    full_name = emp?.full_name ?? ''
    email = emp?.email ?? ''
  }
  return c.json({ username: user.username, is_admin: user.isAdmin, emp_id: user.empId, restrict_edits: !user.isAdmin, full_name, email })
})

editor.get('/api/app-config', c => {
  const cfg = loadAppConfig()
  return c.json({ theme: cfg.theme ?? 'blue', date_format: cfg.date_format ?? 'MM/dd(ddd)' })
})

editor.get('/api/my-reports', c => {
  const user = c.get('user')
  if (!user.empId) return c.json([])
  return c.json(getEmployeeReportUrls(user.empId))
})

editor.get('/api/my-pending', c => {
  const user = c.get('user')
  let pending = getPending()
  if (!user.isAdmin && user.empId) {
    pending = pending.filter(p => String(p.emp_id) === String(user.empId))
  }
  return c.json(pending)
})

editor.delete('/api/my-pending/:id', c => {
  const user = c.get('user')
  const id = c.req.param('id')
  const all = getPending()
  const item = all.find(p => p.id === id)
  if (!item) return c.json({ ok: false, error: 'Not found.' }, 404)
  if (!user.isAdmin && item.submitted_by !== user.username) {
    return c.json({ ok: false, error: 'Access denied.' }, 403)
  }
  rejectPending(id)
  return c.json({ ok: true })
})

editor.get('/api/reports', adminMiddleware, c => c.json(getReportIndex()))

editor.get('/api/reports/:stem', c => {
  const user = c.get('user')
  const stem = c.req.param('stem')
  if (!user.isAdmin) {
    const parts = stem.split('-', 3)
    if (parts.length < 3 || parts[1] !== String(user.empId)) {
      return c.json({ ok: false, error: 'Access denied.' }, 403)
    }
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
  if (!user.isAdmin && String(d.emp_id) !== String(user.empId)) {
    return c.json({ ok: false, error: 'Access denied.' }, 403)
  }
  if (user.isAdmin) {
    addCorrection(d.emp_id, d.name, d.dept, d.timestamp)
    return c.json({ ok: true })
  }
  queueCorrection('ADD', d.emp_id, d.name, d.dept, d.timestamp, null, user.username)
  return c.json({ ok: true, pending: true })
})

editor.post('/api/edit', async c => {
  const user = c.get('user')
  const d = await c.req.json<{ emp_id: string; name: string; dept: string; old_timestamp: string; new_timestamp: string }>()
  if (!user.isAdmin && String(d.emp_id) !== String(user.empId)) {
    return c.json({ ok: false, error: 'Access denied.' }, 403)
  }
  if (user.isAdmin) {
    editCorrection(d.emp_id, d.name, d.dept, d.old_timestamp, d.new_timestamp)
    return c.json({ ok: true })
  }
  queueCorrection('EDIT', d.emp_id, d.name, d.dept, d.old_timestamp, d.new_timestamp, user.username)
  return c.json({ ok: true, pending: true })
})

editor.post('/api/delete', async c => {
  const user = c.get('user')
  const d = await c.req.json<{ emp_id: string; name: string; dept: string; timestamp: string }>()
  if (!user.isAdmin && String(d.emp_id) !== String(user.empId)) {
    return c.json({ ok: false, error: 'Access denied.' }, 403)
  }
  if (user.isAdmin) {
    deleteCorrection(d.emp_id, d.name, d.dept, d.timestamp)
    return c.json({ ok: true })
  }
  queueCorrection('DEL', d.emp_id, d.name, d.dept, d.timestamp, null, user.username)
  return c.json({ ok: true, pending: true })
})

editor.post('/api/bulk-delete', adminMiddleware, async c => {
  bulkDelete(await c.req.json())
  return c.json({ ok: true })
})

export default editor
