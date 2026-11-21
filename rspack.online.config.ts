import { createConfig } from './rspack.config.js'

// 后端托管的在线版；开发时 /api 代理到本地 server
// eslint-disable-next-line import/no-default-export
export default createConfig({ online: true })
