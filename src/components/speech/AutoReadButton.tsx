import clsx from 'clsx'
import { useTranslate } from '../../i18n/index.js'
import { primeReadAloud } from '../../services/speech/readAloud.js'
import { setAutoRead, useSettings } from '../../services/settings.js'
import { IconPlayMediaOutline16 } from '../base/icons.js'
import { IconButton } from '../base/IconButton.js'
import styles from './AutoReadButton.module.css'

/** 左上角的自动朗读开关；具体时机在设置中选择，默认完成后朗读 */
export const AutoReadButton = () => {
  const t = useTranslate()
  const autoRead = useSettings((state) => state.autoRead)
  return (
    <IconButton
      size="m"
      tone="primary"
      icon={<IconPlayMediaOutline16 />}
      tooltip={autoRead ? t('autoReadDisable') : t('autoReadEnable')}
      aria-pressed={autoRead}
      className={clsx(autoRead && styles.active)}
      onClick={() => {
        if (!autoRead) {
          // 用户手势内解锁 AudioContext，后续自动朗读才能直接出声
          primeReadAloud()
        }
        setAutoRead(!autoRead)
      }}
    />
  )
}
