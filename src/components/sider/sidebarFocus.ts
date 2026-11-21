export type SidebarFocusTarget = 'expand' | 'collapse'

let pending: SidebarFocusTarget | null = null

/** 记录一次侧边栏切换，等新按钮出现后把焦点交过去 */
export const requestSidebarFocus = (target: SidebarFocusTarget) => {
  pending = target
}

/** 只消费匹配的目标，避免其他状态变化误触发聚焦 */
export const consumeSidebarFocus = (target: SidebarFocusTarget): boolean => {
  if (pending !== target) {
    return false
  }
  pending = null
  return true
}
