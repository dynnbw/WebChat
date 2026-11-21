import clsx from 'clsx'
import { IconChartOutline16, IconPanelLeftOutline16, NewChatIcon } from '../base/icons.js'
import { useTranslate } from '../../i18n/index.js'
import { setSiderCollapsed } from '../../services/settings.js'
import { newChat } from '../../services/chat/store.js'
import { closeStats, openStats } from '../stats/statsViewState.js'
import { IconButton } from '../base/IconButton.js'
import { AutoReadButton } from '../speech/AutoReadButton.js'
import { requestSidebarFocus } from './sidebarFocus.js'
import styles from './Sider.module.css'

/** 收起后左上角的按钮组 */
export const CollapsedSider = ({ visible }: { visible: boolean }) => {
  const t = useTranslate()
  return (
    <div
      className={clsx(styles.collapsed, !visible && styles.collapsedHidden)}
      aria-hidden={!visible}
    >
      <div className={styles.collapsedGroup}>
        <IconButton
          id="sider-expand-button"
          size="m"
          tone="primary"
          icon={<IconPanelLeftOutline16 />}
          tooltip={t('expandSiderbarButton')}
          onClick={() => {
            requestSidebarFocus('collapse')
            setSiderCollapsed(false)
          }}
        />
        <IconButton
          size="m"
          tone="primary"
          icon={<NewChatIcon />}
          tooltip={t('newChat')}
          onClick={() => {
            newChat()
            closeStats()
          }}
        />
        <AutoReadButton />
        <IconButton
          size="m"
          tone="primary"
          icon={<IconChartOutline16 />}
          tooltip={t('statsTitle')}
          onClick={openStats}
        />
      </div>
    </div>
  )
}
