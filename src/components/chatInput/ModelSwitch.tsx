import { useTranslate } from '../../i18n/index.js'
import { CHAT_MODELS } from '../../services/models.js'
import { setModel, useSettings } from '../../services/settings.js'
import {
  IconCheckOutline16,
  IconChevronDownOutline14,
  IconModelOutline14,
} from '../base/icons.js'
import { Menu } from '../base/Menu.js'
import { Tooltip } from '../base/Tooltip.js'
import styles from './ChatInput.module.css'

/** 模型切换：与深度思考 / 智能搜索同风格的胶囊按钮，选择只影响下一条消息。 */
export const ModelSwitch = () => {
  const t = useTranslate()
  const model = useSettings((state) => state.model)
  const current = CHAT_MODELS.find((item) => item.id === model) ?? CHAT_MODELS[0]
  return (
    <Tooltip content={t('modelSwitchTooltip')}>
      <Menu
        options={CHAT_MODELS.map((item) => ({
          key: item.id,
          label: t(item.labelKey),
          icon: item.id === model ? <IconCheckOutline16 /> : <span />,
          onSelect: () => setModel(item.id),
        }))}
      >
        {({ toggle }) => (
          <button
            type="button"
            className={styles.toggle}
            aria-label={t('modelSwitch')}
            aria-haspopup="menu"
            onClick={toggle}
          >
            <IconModelOutline14 />
            <span className={styles.toggleLabel}>{t(current.labelKey)}</span>
            <IconChevronDownOutline14 />
          </button>
        )}
      </Menu>
    </Tooltip>
  )
}
