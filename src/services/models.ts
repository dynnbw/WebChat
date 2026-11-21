import type { TranslationKey } from '../i18n/index.js'
import type { ChatModel } from './api/types.js'

/** 输入框可切换的模型；新增模型时同步补充 i18n 文案。 */
export const CHAT_MODELS = [
  { id: 'deepseek-flash', labelKey: 'modelFlash' },
  { id: 'deepseek-v4-pro', labelKey: 'modelV4Pro' },
] as const satisfies readonly { id: ChatModel; labelKey: TranslationKey }[]

export const DEFAULT_MODEL: ChatModel = 'deepseek-flash'
