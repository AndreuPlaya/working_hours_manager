import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { ensureSecretKey, getDataRoot } from './infrastructure/settings.js'
import authRoutes from './routes/auth.js'
import editorRoutes from './routes/editor.js'
import adminRoutes from './routes/admin.js'

const app = new Hono()

// Bootstrap secret key on startup
ensureSecretKey()

// API routes
app.route('/', authRoutes)
app.route('/', editorRoutes)
app.route('/', adminRoutes)

// Static assets from built Vue client
const CLIENT_DIST = process.env.CLIENT_DIST ?? join(process.cwd(), '..', 'client', 'dist')

app.use('/assets/*', serveStatic({ root: CLIENT_DIST }))

app.get('/favicon.ico', async c => {
  for (const ext of ['ico', 'png', 'svg', 'jpg', 'jpeg']) {
    const p = join(getDataRoot(), 'config', `favicon.${ext}`)
    if (existsSync(p)) {
      const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'png' ? 'image/png' : ext === 'ico' ? 'image/x-icon' : 'image/jpeg'
      return new Response(readFileSync(p), { headers: { 'Content-Type': mime, 'Cache-Control': 'public, max-age=3600' } })
    }
  }
  return serveStatic({ root: CLIENT_DIST })(c, async () => {})
})

// SPA fallback — serve index.html for all non-API routes
app.get('*', c => {
  try {
    const html = readFileSync(join(CLIENT_DIST, 'index.html'), 'utf-8')
    return c.html(html)
  } catch {
    return c.text('Client not built. Run: pnpm -F client build', 503)
  }
})

const port = Number(process.env.PORT ?? 5000)
console.log(`Working Hours Manager running on http://0.0.0.0:${port}`)

serve({ fetch: app.fetch, port, hostname: '0.0.0.0' })
