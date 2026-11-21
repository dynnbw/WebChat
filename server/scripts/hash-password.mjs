import { randomBytes, scryptSync } from 'node:crypto'

const password = process.argv[2]
if (!password) {
  console.error('Usage: node scripts/hash-password.mjs "your-password"')
  process.exit(1)
}

const N = 16384
const r = 8
const p = 1
const keyLength = 32
const salt = randomBytes(16)
const hash = scryptSync(password, salt, keyLength, {
  N,
  r,
  p,
  maxmem: 64 * 1024 * 1024,
})

console.log(`scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${hash.toString('base64')}`)
