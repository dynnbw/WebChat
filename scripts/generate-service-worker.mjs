import { createHash } from 'node:crypto'
import { readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

const target = process.argv[2]
if (!target) {
  console.error('Usage: node scripts/generate-service-worker.mjs <output-dir>')
  process.exit(1)
}

const root = path.resolve(target)
const rootStat = await stat(root).catch(() => null)
if (!rootStat?.isDirectory()) {
  console.error(`[pwa] output directory not found: ${root}`)
  process.exit(1)
}

const files = []
const walk = async (directory) => {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      await walk(file)
    } else if (entry.isFile()) {
      files.push(file)
    }
  }
}
await walk(root)

const assets = files
  .map((file) => path.relative(root, file).split(path.sep).join('/'))
  // 上一次构建的 sw.js 不能进入自己的预缓存清单。
  .filter((file) => file !== 'sw.js')
  .sort()

const hash = createHash('sha256')
for (const asset of assets) {
  hash.update(asset)
  hash.update(await readFile(path.join(root, asset)))
}
const version = hash.digest('hex').slice(0, 12)

const template = await readFile(path.resolve('scripts/sw-template.js'), 'utf8')
const serviceWorker = template
  .replaceAll('__PRECACHE__', JSON.stringify(assets))
  .replaceAll('__CACHE_VERSION__', JSON.stringify(version))
await writeFile(path.join(root, 'sw.js'), serviceWorker)

console.log(`[pwa] generated sw.js (${assets.length} precache entries, ${version})`)
