/** 在线能力构建开关，由 rspack DefinePlugin 注入 */
export const ONLINE_CAPABLE = __ONLINE_MODE__

const MODE_KEY = 'chat-demo:app-mode'

const readMode = (): 'online' | 'local' => {
  try {
    return localStorage.getItem(MODE_KEY) === 'local' ? 'local' : 'online'
  } catch {
    return 'online'
  }
}

/** 当前构建是否运行在在线模式；本地静态构建永远为 false */
export const ONLINE_MODE = ONLINE_CAPABLE && readMode() === 'online'

/** 切换运行模式并刷新，让 transport / repository 在模块初始化时选中对应实现 */
export const setAppMode = (mode: 'online' | 'local') => {
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    // 存储不可用时刷新后仍保持当前模式
  }
  window.location.reload()
}
