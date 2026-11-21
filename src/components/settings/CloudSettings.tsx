import { useState, type FormEvent } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { cloudLogin, cloudLogout } from '../../services/cloud/client.js'
import {
  setCloudOrigin,
  setCloudToken,
  useSettings,
} from '../../services/settings.js'
import { Button } from '../base/Button.js'
import { showToast } from '../base/toastState.js'
import styles from './Settings.module.css'

const normalizeOrigin = (value: string): string | null => {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null
    }
    return url.origin
  } catch {
    return null
  }
}

/** 本地版连接云端后端：地址 + 密码登录，成功后只保存 Bearer Token */
export const CloudSettings = () => {
  const t = useTranslate()
  const savedOrigin = useSettings((state) => state.cloudOrigin)
  const token = useSettings((state) => state.cloudToken)
  const [origin, setOrigin] = useState(savedOrigin)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) {
      return
    }
    const normalized = normalizeOrigin(origin)
    if (!normalized) {
      showToast({ key: 'cloudSettingsInvalidOrigin', type: 'error' })
      return
    }
    if (!password) {
      return
    }
    setBusy(true)
    try {
      const result = await cloudLogin(normalized, password)
      setCloudOrigin(normalized)
      setCloudToken(result.token)
      setPassword('')
      showToast({ key: 'cloudSettingsLoggedIn' })
    } catch {
      showToast({ key: 'cloudSettingsLoginFailed', type: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const logout = async () => {
    if (busy) {
      return
    }
    setBusy(true)
    try {
      await cloudLogout(savedOrigin, token)
      setCloudToken(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className={styles.cloudForm} onSubmit={submit}>
      <label className={styles.cloudField}>
        <span className={styles.label}>{t('cloudSettingsOrigin')}</span>
        <input
          className={styles.cloudInput}
          value={origin}
          placeholder={t('cloudSettingsOriginPlaceholder')}
          autoComplete="url"
          spellCheck={false}
          onChange={(event) => setOrigin(event.target.value)}
        />
      </label>
      {token ? null : (
        <label className={styles.cloudField}>
          <span className={styles.label}>{t('cloudSettingsPassword')}</span>
          <input
            className={styles.cloudInput}
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
      )}
      <div className={styles.cloudActions}>
        {token ? (
          <Button variant="outlined" size="m" disabled={busy} onClick={logout}>
            {t('cloudSettingsLogout')}
          </Button>
        ) : (
          <Button type="submit" size="m" disabled={busy || !origin.trim() || !password}>
            {t('cloudSettingsLogin')}
          </Button>
        )}
        <span className={styles.cloudStatus}>
          {token ? t('cloudSettingsLoggedIn') : t('cloudSettingsNotLoggedIn')}
        </span>
      </div>
      <div className={styles.description}>{t('cloudSettingsHint')}</div>
    </form>
  )
}
