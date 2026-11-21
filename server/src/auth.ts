import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { MiddlewareHandler } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { cors } from 'hono/cors'
import { config } from './config.js'
import { cleanupExpiredTokens, db } from './db.js'

const COOKIE_NAME = 'chat_session'
const SCRYPT_MAX_MEM = 64 * 1024 * 1024

type PasswordHash = {
  N: number
  r: number
  p: number
  salt: Buffer
  hash: Buffer
}

const parsePasswordHash = (value: string): PasswordHash | null => {
  const [algorithm, n, r, p, salt, hash] = value.split('$')
  if (algorithm !== 'scrypt' || !n || !r || !p || !salt || !hash) {
    return null
  }
  return {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    salt: Buffer.from(salt, 'base64'),
    hash: Buffer.from(hash, 'base64'),
  }
}

const parsedPasswordHash = parsePasswordHash(config.passwordHash)

/** 密码校验使用 scrypt；哈希格式见 scripts/hash-password.mjs */
export const verifyPassword = (password: string): boolean => {
  if (!parsedPasswordHash || password.length > 1024) {
    return false
  }
  const expected = parsedPasswordHash.hash
  const actual = scryptSync(password, parsedPasswordHash.salt, expected.length, {
    N: parsedPasswordHash.N,
    r: parsedPasswordHash.r,
    p: parsedPasswordHash.p,
    maxmem: SCRYPT_MAX_MEM,
  })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex')

const createToken = () => {
  const token = randomBytes(32).toString('base64url')
  const now = Date.now()
  const expiresAt = now + config.tokenTtlMs
  db.prepare('INSERT INTO auth_tokens (token_hash, created_at, expires_at) VALUES (?, ?, ?)').run(
    tokenHash(token),
    now,
    expiresAt
  )
  return { token, expiresAt }
}

const resolveToken = (token: string | null): boolean => {
  if (!token) {
    return false
  }
  const row = db
    .prepare('SELECT expires_at FROM auth_tokens WHERE token_hash = ?')
    .get(tokenHash(token)) as { expires_at: number } | undefined
  if (!row) {
    return false
  }
  if (row.expires_at <= Date.now()) {
    db.prepare('DELETE FROM auth_tokens WHERE token_hash = ?').run(tokenHash(token))
    return false
  }
  return true
}

const revokeToken = (token: string | null) => {
  if (token) {
    db.prepare('DELETE FROM auth_tokens WHERE token_hash = ?').run(tokenHash(token))
  }
}

const readToken = (authorization: string | undefined, cookie: string | undefined) => {
  if (authorization?.startsWith('Bearer ')) {
    const token = authorization.slice('Bearer '.length).trim()
    if (token) {
      return token
    }
  }
  return cookie || null
}

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const token = readToken(c.req.header('authorization'), getCookie(c, COOKIE_NAME))
  if (!resolveToken(token)) {
    return c.json({ error: 'unauthorized' }, 401)
  }
  await next()
}

const loginAttempts = new Map<string, { count: number; resetAt: number }>()
const LOGIN_LIMIT = 5
const LOGIN_WINDOW_MS = 15 * 60 * 1000

const clientIp = (headers: Headers): string =>
  headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || 'local'

const isLoginBlocked = (ip: string): { blocked: boolean; retryAfter: number } => {
  const now = Date.now()
  const entry = loginAttempts.get(ip)
  if (!entry || entry.resetAt <= now) {
    loginAttempts.delete(ip)
    return { blocked: false, retryAfter: 0 }
  }
  return {
    blocked: entry.count >= LOGIN_LIMIT,
    retryAfter: Math.ceil((entry.resetAt - now) / 1000),
  }
}

const recordLoginFailure = (ip: string) => {
  const now = Date.now()
  const entry = loginAttempts.get(ip)
  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS })
    return
  }
  entry.count += 1
}

export const login = async (c: Parameters<MiddlewareHandler>[0]) => {
  const ip = clientIp(c.req.raw.headers)
  const blocked = isLoginBlocked(ip)
  if (blocked.blocked) {
    c.header('Retry-After', String(blocked.retryAfter))
    return c.json({ error: 'rate_limited' }, 429)
  }
  const body = (await c.req.json().catch(() => null)) as { password?: unknown } | null
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!verifyPassword(password)) {
    recordLoginFailure(ip)
    return c.json({ error: 'invalid_password' }, 401)
  }
  loginAttempts.delete(ip)
  cleanupExpiredTokens()
  const { token, expiresAt } = createToken()
  setCookie(c, COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'Lax',
    path: '/',
    maxAge: Math.floor(config.tokenTtlMs / 1000),
  })
  return c.json({ token, expiresAt })
}

export const logout = (c: Parameters<MiddlewareHandler>[0]) => {
  const token = readToken(c.req.header('authorization'), getCookie(c, COOKIE_NAME))
  revokeToken(token)
  deleteCookie(c, COOKIE_NAME, { path: '/' })
  return c.body(null, 204)
}

export const me = (c: Parameters<MiddlewareHandler>[0]) => c.json({ authenticated: true })

/** 浏览器跨源写操作校验 Origin；无 Origin 的非浏览器请求交给认证层处理 */
export const checkOrigin: MiddlewareHandler = async (c, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
    await next()
    return
  }
  const origin = c.req.header('origin')
  if (
    !origin ||
    config.allowedOrigins.size === 0 ||
    config.allowedOrigins.has(origin) ||
    origin === new URL(c.req.url).origin
  ) {
    await next()
    return
  }
  return c.json({ error: 'forbidden' }, 403)
}

export const corsMiddleware = cors({
  origin: (origin) => {
    if (!origin) {
      return ''
    }
    return config.allowedOrigins.has(origin) ? origin : ''
  },
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400,
})
