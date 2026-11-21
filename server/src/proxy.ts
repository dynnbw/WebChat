import fs from 'node:fs'
import path from 'node:path'
import { Hono } from 'hono'
import { bodyLimit } from 'hono/body-limit'
import { requireAuth } from './auth.js'
import { config } from './config.js'
import { db } from './db.js'

const FILES_BETA = 'files-api-2025-04-14'
const idPattern = /^[A-Za-z0-9_-]{1,128}$/

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasFileBlocks = (body: unknown): boolean => {
  if (!isRecord(body) || !Array.isArray(body.messages)) {
    return false
  }
  return body.messages.some(
    (message) =>
      isRecord(message) &&
      Array.isArray(message.content) &&
      message.content.some(
        (block) => isRecord(block) && (block.type === 'image' || block.type === 'document')
      )
  )
}

const forwardError = async (response: Response) => {
  const text = await response.text().catch(() => '')
  return new Response(text, {
    status: response.status,
    headers: {
      'Content-Type': response.headers.get('Content-Type') ?? 'application/json',
    },
  })
}

export const proxyRoutes = new Hono()

proxyRoutes.use('*', requireAuth)

proxyRoutes.post('/chat', bodyLimit({ maxSize: config.maxChatBytes }), async (c) => {
  const raw = await c.req.text()
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return c.json({ error: 'invalid_json' }, 400)
  }
  if (!isRecord(body)) {
    return c.json({ error: 'invalid_body' }, 400)
  }
  const headers = new Headers({
    'x-api-key': config.apiKey,
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  })
  if (hasFileBlocks(body)) {
    headers.set('anthropic-beta', FILES_BETA)
  }
  const upstream = await fetch(`${config.apiOrigin}/anthropic/v1/messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ...body, stream: true }),
    signal: c.req.raw.signal,
  }).catch((error: unknown) => {
    if (c.req.raw.signal.aborted) {
      throw error
    }
    return null
  })
  if (!upstream) {
    return c.json({ error: 'upstream_unreachable' }, 502)
  }
  if (!upstream.ok) {
    return forwardError(upstream)
  }
  const responseHeaders = new Headers({
    'Content-Type': upstream.headers.get('Content-Type') ?? 'text/event-stream',
    'Cache-Control': 'no-cache',
    'X-Accel-Buffering': 'no',
  })
  return new Response(upstream.body, { status: upstream.status, headers: responseHeaders })
})

proxyRoutes.post('/files', bodyLimit({ maxSize: config.maxFileBytes }), async (c) => {
  const form = await c.req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return c.json({ error: 'file_required' }, 400)
  }
  const id = form?.get('id')
  const purpose = form?.get('purpose')
  const upstreamForm = new FormData()
  if (typeof purpose === 'string' && purpose) {
    upstreamForm.append('purpose', purpose)
  }
  upstreamForm.append('file', file, file.name)
  const headers = new Headers({
    'x-api-key': config.apiKey,
    'anthropic-beta': FILES_BETA,
  })
  const upstream = await fetch(`${config.apiOrigin}/anthropic/v1/files`, {
    method: 'POST',
    headers,
    body: upstreamForm,
    signal: c.req.raw.signal,
  }).catch((error: unknown) => {
    if (c.req.raw.signal.aborted) {
      throw error
    }
    return null
  })
  if (!upstream) {
    return c.json({ error: 'upstream_unreachable' }, 502)
  }
  if (!upstream.ok) {
    return forwardError(upstream)
  }
  const result = (await upstream.json().catch(() => null)) as unknown
  // 在线对话的图片原件落盘，刷新后仍可预览
  if (
    typeof id === 'string' &&
    idPattern.test(id) &&
    file.type.startsWith('image/') &&
    file.size <= config.maxFileBytes
  ) {
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
  }
  return c.json(result)
})

proxyRoutes.post('/speech/asr', bodyLimit({ maxSize: config.maxAsrBytes }), async (c) => {
  const form = await c.req.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) {
    return c.json({ error: 'file_required' }, 400)
  }
  const upstreamForm = new FormData()
  upstreamForm.append('file', file, file.name)
  const upstream = await fetch(`${config.apiOrigin}/v1/tools/asr`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: upstreamForm,
    signal: c.req.raw.signal,
  }).catch((error: unknown) => {
    if (c.req.raw.signal.aborted) {
      throw error
    }
    return null
  })
  if (!upstream) {
    return c.json({ error: 'upstream_unreachable' }, 502)
  }
  if (!upstream.ok) {
    return forwardError(upstream)
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/json',
    },
  })
})

proxyRoutes.post('/speech/tts', bodyLimit({ maxSize: config.maxChatBytes }), async (c) => {
  const raw = await c.req.text()
  const upstream = await fetch(`${config.apiOrigin}/v1/tools/tts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: raw,
    signal: c.req.raw.signal,
  }).catch((error: unknown) => {
    if (c.req.raw.signal.aborted) {
      throw error
    }
    return null
  })
  if (!upstream) {
    return c.json({ error: 'upstream_unreachable' }, 502)
  }
  if (!upstream.ok) {
    return forwardError(upstream)
  }
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    },
  })
})
