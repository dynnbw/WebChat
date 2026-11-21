import type { Session, SessionSummary } from '../chat/types.js'

export type CloudSessionKind = 'backup' | 'online'

export type CloudSessionSummary = Pick<SessionSummary, 'id' | 'title' | 'createdAt' | 'updatedAt'> & {
  kind: CloudSessionKind
}

export type CloudSessionDetail = {
  session: Session
  kind: CloudSessionKind
  updatedAt: number
}

export class CloudError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message)
    this.name = 'CloudError'
  }
}

const base = (origin: string) => origin.trim().replace(/\/+$/, '')

const request = async (
  origin: string,
  token: string | null,
  path: string,
  init: RequestInit = {}
): Promise<Response> => {
  const headers = new Headers(init.headers)
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  let response: Response
  try {
    response = await fetch(`${base(origin)}${path}`, { ...init, headers })
  } catch (error) {
    throw new CloudError(0, error instanceof Error ? error.message : String(error))
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    let message = text || response.statusText
    try {
      const body = JSON.parse(text) as { error?: unknown }
      if (typeof body?.error === 'string') {
        message = body.error
      }
    } catch {
      // 非 JSON 错误体直接使用原文
    }
    throw new CloudError(response.status, message)
  }
  return response
}

export const cloudLogin = async (
  origin: string,
  password: string
): Promise<{ token: string; expiresAt: number }> => {
  const response = await request(origin, null, '/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  })
  return (await response.json()) as { token: string; expiresAt: number }
}

export const cloudLogout = async (origin: string, token: string | null): Promise<void> => {
  await request(origin, token, '/api/logout', { method: 'POST' }).catch(() => {})
}

export const cloudMe = async (origin: string, token: string | null): Promise<void> => {
  await request(origin, token, '/api/me')
}

export const cloudListSessions = async (
  origin: string,
  token: string | null,
  kind?: CloudSessionKind
): Promise<CloudSessionSummary[]> => {
  const query = kind ? `?kind=${kind}` : ''
  const response = await request(origin, token, `/api/cloud/sessions${query}`)
  const body = (await response.json()) as { sessions: CloudSessionSummary[] }
  return body.sessions
}

export const cloudGetSession = async (
  origin: string,
  token: string | null,
  id: string
): Promise<CloudSessionDetail> => {
  const response = await request(origin, token, `/api/cloud/sessions/${encodeURIComponent(id)}`)
  return (await response.json()) as CloudSessionDetail
}

export const cloudPutSession = async (
  origin: string,
  token: string | null,
  kind: CloudSessionKind,
  session: Session
): Promise<{ updatedAt: number; missingFiles?: string[] }> => {
  const response = await request(
    origin,
    token,
    `/api/cloud/sessions/${encodeURIComponent(session.id)}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, session }),
    }
  )
  return (await response.json()) as { updatedAt: number; missingFiles?: string[] }
}

export const cloudDeleteSession = async (
  origin: string,
  token: string | null,
  id: string
): Promise<void> => {
  await request(origin, token, `/api/cloud/sessions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
}

export const cloudUploadImage = async (
  origin: string,
  token: string | null,
  id: string,
  blob: Blob,
  name = `${id}.png`
): Promise<void> => {
  const form = new FormData()
  form.append('file', blob, name)
  await request(origin, token, `/api/cloud/files/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: form,
  })
}

export const cloudFileUrl = (origin: string, id: string): string =>
  `${base(origin)}/api/cloud/files/${encodeURIComponent(id)}`
