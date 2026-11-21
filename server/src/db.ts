import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { config } from './config.js'

fs.mkdirSync(config.dataDir, { recursive: true })
fs.mkdirSync(config.filesDir, { recursive: true })

export const db = new DatabaseSync(path.join(config.dataDir, 'app.db'))

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS cloud_sessions (
    id           TEXT PRIMARY KEY,
    kind         TEXT NOT NULL CHECK (kind IN ('backup', 'online')),
    title        TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    updated_at   INTEGER NOT NULL,
    data_json    TEXT NOT NULL,
    encrypted    INTEGER NOT NULL DEFAULT 0,
    key_version  INTEGER
  );

  CREATE TABLE IF NOT EXISTS cloud_files (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    mime         TEXT NOT NULL,
    size         INTEGER NOT NULL,
    path         TEXT NOT NULL,
    created_at   INTEGER NOT NULL,
    encrypted    INTEGER NOT NULL DEFAULT 0,
    key_version  INTEGER
  );

  CREATE TABLE IF NOT EXISTS auth_tokens (
    token_hash  TEXT PRIMARY KEY,
    created_at  INTEGER NOT NULL,
    expires_at  INTEGER NOT NULL
  );
`)

export const cleanupExpiredTokens = () => {
  db.prepare('DELETE FROM auth_tokens WHERE expires_at <= ?').run(Date.now())
}
