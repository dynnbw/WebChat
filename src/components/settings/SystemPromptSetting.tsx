import clsx from 'clsx'
import { useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { setSystemPrompt, useSettings } from '../../services/settings.js'
import { Button } from '../base/Button.js'
import styles from './Settings.module.css'

/** 全局系统提示词：完全替换默认身份说明，保存后用于之后的所有请求。 */
export const SystemPromptSetting = () => {
  const t = useTranslate()
  const saved = useSettings((state) => state.systemPrompt)
  const [value, setValue] = useState(saved)
  const empty = value.trim() === ''
  const changed = value !== saved
  return (
    <div className={clsx(styles.cell, styles.promptCell)}>
      <div className={styles.text}>
        <label className={styles.promptLabel} htmlFor="system-prompt">
          {t('settingsSystemPrompt')}
        </label>
        <div className={styles.description}>{t('settingsSystemPromptHint')}</div>
      </div>
      <textarea
        id="system-prompt"
        className={styles.promptInput}
        rows={4}
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
      <div className={styles.promptFooter}>
        {empty ? <div className={styles.error}>{t('settingsSystemPromptEmpty')}</div> : null}
        <Button
          variant="primary"
          size="m"
          className={styles.promptSave}
          disabled={empty || !changed}
          onClick={() => setSystemPrompt(value)}
        >
          {t('save')}
        </Button>
      </div>
    </div>
  )
}
