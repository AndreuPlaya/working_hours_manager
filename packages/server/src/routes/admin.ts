import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { Hono } from 'hono'
import { approvePending, getPending, getHistory, rejectPending, undoCorrection, revertCorrection } from '../application/correctionService.js'
import { deleteRawFile, listRawFiles, saveRawFile } from '../application/fileService.js'
import { getEmployeeList, getPendingPreview } from '../application/reportService.js'
import { createAdmin, deleteAdmin, ERR_MISSING, ERR_NOT_FOUND, listAdmins, updateAdminPassword, updateEmployee } from '../application/userService.js'
import { adminMiddleware, authMiddleware } from '../middleware/auth.js'
import { getDataRoot, loadAppConfig, saveAppConfig } from '../infrastructure/settings.js'

const admin = new Hono()

admin.use('/api/admin/*', authMiddleware, adminMiddleware)

// App configuration
admin.get('/api/admin/app-config', c => c.json(loadAppConfig()))

admin.put('/api/admin/app-config', async c => {
  const body = await c.req.json<{ time_format?: string; theme?: string; date_format?: string }>()
  const cfg = loadAppConfig()
  if (body.time_format === '24h' || body.time_format === '12h') cfg.time_format = body.time_format
  if (typeof body.theme === 'string') cfg.theme = body.theme.trim() || undefined
  if (typeof body.date_format === 'string') cfg.date_format = body.date_format.trim() || undefined
  saveAppConfig(cfg)
  return c.json({ ok: true })
})

admin.post('/api/admin/app-config/favicon', async c => {
  const body = await c.req.parseBody()
  const file = body['favicon']
  /* v8 ignore next */ if (!file || typeof file === 'string') return c.json({ ok: false, error: 'No file provided.' }, 400)
  const ext = ((file as File).name ?? '').split('.').pop()?.toLowerCase() ?? ''
  if (!['ico', 'png', 'svg', 'jpg', 'jpeg'].includes(ext)) return c.json({ ok: false, error: 'Unsupported file type.' }, 400)
  const dir = join(getDataRoot(), 'config')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `favicon.${ext}`), Buffer.from(await (file as File).arrayBuffer()))
  const cfg = loadAppConfig()
  cfg.favicon_ext = ext
  saveAppConfig(cfg)
  return c.json({ ok: true, ext })
})

// Employees
admin.get('/api/admin/employees', c => c.json(getEmployeeList()))

admin.put('/api/admin/employees/:empId', async c => {
  const err = updateEmployee(c.req.param('empId'), await c.req.json())
  if (err === 'USERNAME_TAKEN') return c.json({ ok: false, error: 'Username already taken.' }, 409)
  return c.json({ ok: true })
})

// Admin accounts
admin.get('/api/admin/admins', c => c.json(listAdmins()))

admin.post('/api/admin/admins', async c => {
  const { username = '', password = '' } = await c.req.json<{ username: string; password: string }>()
  const err = createAdmin(username.trim(), password)
  if (err === ERR_MISSING) return c.json({ ok: false, error: 'Username and password are required.' }, 400)
  if (err === 'USERNAME_TAKEN') return c.json({ ok: false, error: 'Username already exists.' }, 409)
  return c.json({ ok: true })
})

admin.put('/api/admin/admins/:username', async c => {
  const { password = '' } = await c.req.json<{ password: string }>()
  const err = updateAdminPassword(c.req.param('username'), password)
  if (err === ERR_NOT_FOUND) return c.json({ ok: false, error: 'Admin user not found.' }, 404)
  return c.json({ ok: true })
})

admin.delete('/api/admin/admins/:username', c => {
  const user = c.get('user')
  const err = deleteAdmin(c.req.param('username'), user.username)
  if (err === 'PROTECTED') return c.json({ ok: false, error: 'The built-in admin account cannot be deleted.' }, 403)
  if (err === 'SELF_DELETE') return c.json({ ok: false, error: 'Cannot delete your own account.' }, 400)
  if (err === ERR_NOT_FOUND) return c.json({ ok: false, error: 'Admin user not found.' }, 404)
  return c.json({ ok: true })
})

// Raw files
admin.get('/api/admin/raw-files', c => c.json(listRawFiles()))

admin.post('/api/admin/raw-files', async c => {
  const body = await c.req.parseBody()
  const file = body['file']
  /* v8 ignore next */ if (!file || typeof file === 'string') return c.json({ ok: false, error: 'No file provided.' }, 400)
  const name = (file as File).name ?? ''
  const content = await (file as File).text()
  const { ok, error } = saveRawFile(name, content)
  if (!ok) {
    const status = error === 'No filename.' || error === 'Only .txt files are accepted.' ? 400 : 422
    return c.json({ ok: false, name, error }, status)
  }
  return c.json({ ok: true, name })
})

admin.delete('/api/admin/raw-files/:filename', c => {
  const { ok, error } = deleteRawFile(c.req.param('filename'))
  if (!ok) {
    return c.json({ ok: false, error }, error === 'Invalid file.' ? 400 : 404)
  }
  return c.json({ ok: true })
})

// Pending corrections
admin.get('/api/admin/pending', c => c.json(getPending()))

admin.get('/api/admin/pending/:id/preview', c => {
  const items = getPending()
  const item = items.find(x => x.id === c.req.param('id'))
  if (!item) return c.json({ ok: false, error: 'Pending item not found.' }, 404)
  const preview = getPendingPreview(item)
  if (!preview) return c.json({ ok: false, error: 'Could not compute preview.' }, 400)
  return c.json({ ok: true, ...preview as object })
})

admin.post('/api/admin/pending/:id/approve', c => {
  if (!approvePending(c.req.param('id'), c.get('user').username)) return c.json({ ok: false, error: 'Pending item not found.' }, 404)
  return c.json({ ok: true })
})

admin.post('/api/admin/pending/:id/reject', c => {
  if (!rejectPending(c.req.param('id'))) return c.json({ ok: false, error: 'Pending item not found.' }, 404)
  return c.json({ ok: true })
})

// Correction history
admin.get('/api/admin/history', c => c.json(getHistory()))

admin.post('/api/admin/history/:id/undo', c => {
  if (!undoCorrection(c.req.param('id'))) {
    return c.json({ ok: false, error: 'Item not found or already undone.' }, 404)
  }
  return c.json({ ok: true })
})

admin.post('/api/admin/history/:id/revert', c => {
  if (!revertCorrection(c.req.param('id'))) {
    return c.json({ ok: false, error: 'Item not found.' }, 404)
  }
  return c.json({ ok: true })
})

export default admin
