import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { HTTPException } from 'hono/http-exception'
import { checkOrigin, corsMiddleware, login, logout, me, requireAuth } from './auth.js'
import { cloudRoutes } from './cloud.js'
import { config } from './config.js'
import { cleanupExpiredTokens } from './db.js'
import { proxyRoutes } from './proxy.js'

const app = new Hono()

app.use('/api/*', corsMiddleware)
app.use('/api/*', checkOrigin)

app.get('/api/health', (c) => c.json({ ok: true }))
app.post('/api/login', bodyLimit({ maxSize: 16 * 1024 }), login)
app.post('/api/logout', logout)
app.get('/api/me', requireAuth, me)

app.route('/api/cloud', cloudRoutes)
app.route('/api', proxyRoutes)

app.notFound((c) => c.json({ error: 'not_found' }, 404))

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return error.getResponse()
  }
  console.error('[server]', error)
  return c.json({ error: 'internal_error' }, 500)
})

cleanupExpiredTokens()
const cleanupTimer = setInterval(cleanupExpiredTokens, 60 * 60 * 1000)
cleanupTimer.unref()

serve(
  {
    fetch: app.fetch,
    port: config.port,
    hostname: '127.0.0.1',
  },
  (info) => {
    console.log(`chat-demo server listening on http://127.0.0.1:${info.port}`)
  }
)
