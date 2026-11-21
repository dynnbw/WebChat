import clsx from 'clsx'
import { memo, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import {
  IconCloudOutline16,
  IconEditOutline16,
  IconEllipsisOutline16,
  IconTrashOutline16,
} from '../base/icons.js'
import {
  renameSession,
  selectSession,
  setSessionCloudSync,
} from '../../services/chat/store.js'
import { useSettings } from '../../services/settings.js'
import type { SessionSummary } from '../../services/chat/types.js'
import { IconButton } from '../base/IconButton.js'
import { Menu, type MenuOption } from '../base/Menu.js'
import { ONLINE_MODE } from '../../services/online/mode.js'
import { openSettings } from '../settings/settingsDialogState.js'
import { showToast } from '../base/toastState.js'
import { closeMobileSider } from './mobileSiderState.js'
import { closeStats } from '../stats/statsViewState.js'
import styles from './SessionItem.module.css'

export const SessionItem = memo(function SessionItem({
  session,
  active,
  onDelete,
  onConvert,
}: {
  session: SessionSummary
  active: boolean
  onDelete: () => void
  onConvert: () => void
}) {
  const t = useTranslate()
  const [editing, setEditing] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const cloudReady = useSettings((state) => Boolean(state.cloudOrigin && state.cloudToken))
  const displayTitle = session.title || t('untitledChat')

  const toggleCloudSync = () => {
    if (!session.cloudSync && !cloudReady) {
      showToast({ key: 'cloudSyncNoLogin', type: 'error' })
      openSettings('cloud')
      return
    }
    void setSessionCloudSync(session.id, !session.cloudSync).then((saved) => {
      if (!saved) {
        showToast({ key: 'cloudSyncFailed', type: 'error' })
      }
    })
  }

  const menuOptions: MenuOption[] = []
  if (session.cloudKind !== 'backup') {
    menuOptions.push({
      key: 'rename',
      label: t('sessionItemMenuRenameOption'),
      icon: <IconEditOutline16 />,
      onSelect: () => {
        setMenuOpen(false)
        setEditing(true)
      },
    })
  }
  if (!ONLINE_MODE) {
    menuOptions.push({
      key: 'cloud',
      label: session.cloudSync ? t('cloudSyncDisable') : t('cloudSyncEnable'),
      icon: <IconCloudOutline16 />,
      onSelect: toggleCloudSync,
    })
  }
  if (ONLINE_MODE && session.cloudKind === 'backup') {
    menuOptions.push({
      key: 'convert',
      label: t('cloudBackupConvert'),
      icon: <IconCloudOutline16 />,
      onSelect: onConvert,
    })
  }
  menuOptions.push({
    key: 'delete',
    label: t('delete'),
    icon: <IconTrashOutline16 />,
    danger: true,
    onSelect: onDelete,
  })

  if (editing) {
    const finish = (title: string) => {
      setEditing(false)
      if (title.trim() && title.trim() !== displayTitle) {
        renameSession(session.id, title.trim())
      }
    }
    return (
      <input
        className={styles.renameInput}
        defaultValue={displayTitle}
        autoFocus
        onFocus={(event) => event.target.select()}
        onBlur={(event) => finish(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            finish(event.currentTarget.value)
          } else if (event.key === 'Escape') {
            setEditing(false)
          }
        }}
      />
    )
  }

  return (
    <div
      className={clsx(styles.item, active && styles.active)}
      onClick={() => {
        selectSession(session.id)
        closeStats()
        closeMobileSider()
      }}
    >
      <div className={styles.title}>{displayTitle}</div>
      {session.cloudSync || session.cloudKind === 'backup' ? (
        <span
          className={styles.cloud}
          title={
            session.cloudKind === 'backup' ? t('cloudBackupLabel') : t('cloudSyncedTooltip')
          }
        >
          <IconCloudOutline16 />
        </span>
      ) : null}
      <div
        className={clsx(styles.action, menuOpen && styles.actionOpen)}
        onClick={(event) => event.stopPropagation()}
      >
        <Menu onOpenChange={setMenuOpen} options={menuOptions}>
          {({ toggle }) => (
            <IconButton icon={<IconEllipsisOutline16 />} aria-label={t('more')} onClick={toggle} />
          )}
        </Menu>
      </div>
    </div>
  )
})
