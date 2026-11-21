import { cloudLogin, cloudLogout, cloudMe } from '../cloud/client.js'

/** 在线版同源 Cookie 登录；登录响应中的 Bearer Token 不需要保存 */
export const onlineLogin = (password: string) => cloudLogin('', password)
export const onlineLogout = () => cloudLogout('', null)
export const onlineMe = () => cloudMe('', null)
