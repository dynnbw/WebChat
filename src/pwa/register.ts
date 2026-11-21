/** 开发模式不注册 SW，并清掉同一页面可能残留的旧注册，避免缓存干扰 HMR。 */
const clearDevelopmentWorker = () => {
  if (!('serviceWorker' in navigator)) {
    return
  }
  void navigator.serviceWorker
    .getRegistrations()
    .then((registrations) =>
      Promise.all(registrations.map((registration) => registration.unregister()))
    )
    .catch(() => {})
}

const register = () => {
  navigator.serviceWorker
    .register(new URL('sw.js', document.baseURI), { updateViaCache: 'none' })
    .catch((error: unknown) => {
      // eslint-disable-next-line no-console
      console.warn('[pwa] service worker registration failed', error)
    })
}

/**
 * 只注册同目录下的构建产物 sw.js；页面通过 file:// 打开或不是安全上下文时跳过。
 * 在线版同样只缓存应用壳，/api 请求由 Service Worker 直接放行。
 */
export const registerServiceWorker = () => {
  if (!('serviceWorker' in navigator)) {
    return
  }
  if (!__PWA_ENABLED__) {
    clearDevelopmentWorker()
    return
  }
  if (!window.isSecureContext) {
    return
  }
  if (document.readyState === 'complete') {
    register()
  } else {
    window.addEventListener('load', register, { once: true })
  }
}
