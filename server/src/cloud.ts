import fs from 'node:fs'
import path from 'node:path'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { requireAuth } from './auth.js'
import { config } from './config.js'
import { db } from './db.js'

type CloudKind = 'backup' | 'online'

type SessionRow = {
  id: string
  kind: CloudKind
  title: string
  created_at: number
  updated_at: number
  data_json: string
}

const idPattern = /^[A-Za-z0-9_-]{1,128}$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readKind = (value: unknown): CloudKind | null =>
  value === 'backup' || value === 'online' ? value : null

const collectFileIds = (json: string): string[] => {
  const ids = new Set<string>()
  try {
    const session = JSON.parse(json) as { messages?: unknown }
    if (!Array.isArray(session.messages)) {
      return []
    }
    for (const message of session.messages) {
      if (!isRecord(message) || !Array.isArray(message.files)) {
        continue
      }
      for (const file of message.files) {
        if (isRecord(file) && typeof file.id === 'string') {
          ids.add(file.id)
        }
      }
    }
  } catch {
    return []
  }
  return [...ids]
}

/** 删除云端会话后，清理不再被任何云端会话引用的图片 */
const collectFiles = () => {
  const referenced = new Set<string>()
  const rows = db.prepare('SELECT data_json FROM cloud_sessions').all() as {
    data_json: string
  }[]
  for (const row of rows) {
    for (const id of collectFileIds(row.data_json)) {
      referenced.add(id)
    }
  }
  const files = db.prepare('SELECT id, path FROM cloud_files').all() as {
    id: string
    path: string
  }[]
  for (const file of files) {
    if (referenced.has(file.id)) {
      continue
    }
    db.prepare('DELETE FROM cloud_files WHERE id = ?').run(file.id)
    fs.rmSync(file.path, { force: true })
  }
}

export const cloudRoutes = new Hono()

cloudRoutes.use('*', requireAuth)

cloudRoutes.get('/sessions', (c) => {
  const kindParam = c.req.query('kind')
  const kind = kindParam ? readKind(kindParam) : null
  if (kindParam && !kind) {
    return c.json({ error: 'invalid_kind' }, 400)
  }
  const rows = (
    kind
      ? db
          .prepare(
            `SELECT id, kind, title, created_at, updated_at
             FROM cloud_sessions WHERE kind = ? ORDER BY updated_at DESC`
          )
          .all(kind)
      : db
          .prepare(
            `SELECT id, kind, title, created_at, updated_at
             FROM cloud_sessions ORDER BY updated_at DESC`
          )
          .all()
  ) as Omit<SessionRow, 'data_json'>[]
  return c.json({
    sessions: rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  })
})

cloudRoutes.get('/sessions/:id', (c) => {
  const id = c.req.param('id')
  if (!idPattern.test(id)) {
    return c.json({ error: 'invalid_id' }, 400)
  }
  const row = db.prepare('SELECT * FROM cloud_sessions WHERE id = ?').get(id) as
    | SessionRow
    | undefined
  if (!row) {
    return c.json({ error: 'not_found' }, 404)
  }
  let session: unknown
  try {
    session = JSON.parse(row.data_json)
  } catch {
    return c.json({ error: 'invalid_session' }, 500)
  }
  return c.json({ session, kind: row.kind, updatedAt: row.updated_at })
})

cloudRoutes.put(
  '/sessions/:id',
  bodyLimit({ maxSize: config.maxChatBytes }),
  async (c) => {
    const id = c.req.param('id')
    if (!idPattern.test(id)) {
      return c.json({ error: 'invalid_id' }, 400)
    }
    const body = (await c.req.json().catch(() => null)) as {
      kind?: unknown
      session?: unknown
    } | null
    const kind = readKind(body?.kind)
    if (!kind || !isRecord(body?.session)) {
      return c.json({ error: 'invalid_body' }, 400)
    }
    if (body.session.id !== id) {
      return c.json({ error: 'id_mismatch' }, 400)
    }
    const title = typeof body.session.title === 'string' ? body.session.title : ''
    const createdAt =
      typeof body.session.createdAt === 'number' ? body.session.createdAt : Date.now()
    const dataJson = JSON.stringify(body.session)
    const updatedAt = Date.now()
    db.prepare(
      `INSERT INTO cloud_sessions (id, kind, title, created_at, updated_at, data_json)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         kind = excluded.kind,
         title = excluded.title,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at,
         data_json = excluded.data_json`
    ).run(id, kind, title, createdAt, updatedAt, dataJson)
    const missingFiles = collectFileIds(dataJson).filter(
      (fileId) => !db.prepare('SELECT 1 FROM cloud_files WHERE id = ?').get(fileId)
    )
    return c.json({ updatedAt, missingFiles })
  }
)

cloudRoutes.delete('/sessions/:id', (c) => {
  const id = c.req.param('id')
  if (!idPattern.test(id)) {
    return c.json({ error: 'invalid_id' }, 400)
  }
  db.prepare('DELETE FROM cloud_sessions WHERE id = ?').run(id)
  collectFiles()
  return c.body(null, 204)
})

cloudRoutes.put(
  '/files/:id',
  bodyLimit({ maxSize: config.maxFileBytes }),
  async (c) => {
    const id = c.req.param('id')
    if (!idPattern.test(id)) {
      return c.json({ error: 'invalid_id' }, 400)
    }
    const form = await c.req.formData().catch(() => null)
    const file = form?.get('file')
    if (!(file instanceof File) || !file.type.startsWith('image/')) {
      return c.json({ error: 'image_required' }, 400)
    }
    if (file.size > config.maxFileBytes) {
      return c.json({ error: 'too_large' }, 413)
    }
    const filePath = path.join(config.filesDir, id)
    fs.writeFileSync(filePath, Buffer.from(await file.arrayBuffer()))
    db.prepare(
      `INSERT INTO cloud_files (id, name, mime, size, path, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         mime = excluded.mime,
         size = excluded.size,
         path = excluded.path,
         created_at = excluded.created_at`
    ).run(id, file.name, file.type, file.size, filePath, Date.now())
    return c.json({ id })
  }
)

cloudRoutes.get('/files/:id', (c) => {
  const id = c.req.param('id')
  if (!idPattern.test(id)) {
    return c.json({ error: 'invalid_id' }, 400)
  }
  const row = db.prepare('SELECT mime, path FROM cloud_files WHERE id = ?').get(id) as
    | { mime: string; path: string }
    | undefined
  if (!row || !fs.existsSync(row.path)) {
    return c.json({ error: 'not_found' }, 404)
  }
  const data = fs.readFileSync(row.path)
  return new Response(data, {
    headers: {
      'Content-Type': row.mime,
      'Cache-Control': 'private, max-age=31536000, immutable',
    },
  })
})
