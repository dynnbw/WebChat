import { IconChartOutline16, IconMenuOutline20, IconNewChatOutline20 } from '../base/icons.js'
import { useTranslate } from '../../i18n/index.js'
import { newChat } from '../../services/chat/store.js'
import { IconButton } from '../base/IconButton.js'
import { openMobileSider } from '../sider/mobileSiderState.js'
import { AutoReadButton } from '../speech/AutoReadButton.js'
import { openStats } from '../stats/statsViewState.js'
import styles from './MobileHeader.module.css'

/** 移动端顶栏：与 PC 收起侧边栏一致，提供菜单、新对话和统计入口。 */
export const MobileHeader = ({ title }: { title?: string }) => {
  const t = useTranslate()
  return (
    <div className={styles.header}>
      <div className={styles.group}>
        <IconButton
          size="m"
          tone="primary"
          icon={<IconMenuOutline20 />}
          tooltip={t('expandSiderbarButton')}
          onClick={openMobileSider}
        />
        <IconButton
          size="m"
          tone="primary"
          icon={<IconChartOutline16 />}
          tooltip={t('statsTitle')}
          onClick={openStats}
        />
      </div>
      <div className={styles.title}>{title ?? ''}</div>
      <div className={styles.group}>
        <AutoReadButton />
        <IconButton
          size="m"
          tone="primary"
          icon={<IconNewChatOutline20 />}
          tooltip={t('newChat')}
          onClick={newChat}
        />
      </div>
    </div>
  )
}
