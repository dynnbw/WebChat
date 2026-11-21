import 'dotenv/config'
import path from 'node:path'

const required = (name: string): string => {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

const positiveInt = (name: string, fallback: number): number => {
  const value = Number(process.env[name])
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

const originList = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)

const appOrigin = process.env.APP_ORIGIN?.trim() || null
const allowedOrigins = new Set([
  ...(appOrigin ? [appOrigin] : []),
  ...originList(process.env.ALLOWED_SYNC_ORIGINS),
])

export const config = {
  port: positiveInt('PORT', 8787),
  dataDir: path.resolve(process.env.DATA_DIR ?? 'data'),
  apiOrigin: (process.env.DEEPSEEK_API_ORIGIN ?? 'https://api.deepseek.com').replace(/\/+$/, ''),
  apiKey: required('DEEPSEEK_API_KEY'),
  passwordHash: required('APP_PASSWORD_HASH'),
  appOrigin,
  allowedOrigins,
  cookieSecure: process.env.COOKIE_SECURE !== '0',
  tokenTtlMs: positiveInt('TOKEN_TTL_DAYS', 90) * 24 * 60 * 60 * 1000,
  maxChatBytes: positiveInt('MAX_CHAT_BYTES', 2 * 1024 * 1024),
  maxFileBytes: positiveInt('MAX_FILE_BYTES', 25 * 1024 * 1024),
  maxAsrBytes: positiveInt('MAX_ASR_BYTES', 8 * 1024 * 1024),
  filesDir: path.resolve(process.env.DATA_DIR ?? 'data', 'files'),
} as const
