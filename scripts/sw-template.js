/* eslint-disable no-restricted-globals */
// 由 scripts/generate-service-worker.mjs 在构建后替换占位符并写入 dist/sw.js。
const PRECACHE = __PRECACHE__
const CACHE_VERSION = __CACHE_VERSION__
const CACHE_PREFIX = 'webchat-pwa-'
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`
const INDEX_URL = new URL('index.html', self.registration.scope).href

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') {
    return
  }
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) {
    return
  }
  // 在线版的 API 代理和本地版的跨域 API 都不进入缓存。
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
    return
  }

  // 页面导航优先取网络；离线时回退到构建时缓存的单页入口。
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(INDEX_URL).then((cached) => cached ?? Response.error())
      )
    )
    return
  }

  event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)))
})
