import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useTranslate } from '../../i18n/index.js'
import { CloudError } from '../../services/cloud/client.js'
import { onlineLogin, onlineMe } from '../../services/online/auth.js'
import { setAppMode } from '../../services/online/mode.js'
import { Button } from '../base/Button.js'
import styles from './OnlineGate.module.css'

type GateState = 'checking' | 'login' | 'ready' | 'error'

/** 在线版登录门禁：未登录不挂载聊天 UI，避免在无 Cookie 时访问云端接口 */
export const OnlineGate = ({ children }: { children: ReactNode }) => {
  const t = useTranslate()
  const [state, setState] = useState<GateState>('checking')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  const check = async () => {
    setState('checking')
    setFailed(false)
    try {
      await onlineMe()
      setState('ready')
    } catch (error) {
      setState(error instanceof CloudError && error.status === 401 ? 'login' : 'error')
    }
  }

  useEffect(() => {
    void check()
  }, [])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy || !password) {
      return
    }
    setBusy(true)
    setFailed(false)
    try {
      await onlineLogin(password)
      setPassword('')
      setState('ready')
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  if (state === 'ready') {
    return <>{children}</>
  }

  return (
    <div className={styles.view}>
      <div className={styles.card}>
        <div className={styles.title}>WebChat</div>
        {state === 'checking' ? (
          <div className={styles.status} role="status" aria-live="polite">
            {t('sessionLoading')}
          </div>
        ) : state === 'error' ? (
          <div className={styles.status} role="alert">
            <div>{t('commonNetworkErrorToast')}</div>
            <Button variant="outlined" size="m" onClick={() => void check()}>
              {t('retry')}
            </Button>
            <Button variant="outlined" size="m" onClick={() => setAppMode('local')}>
              {t('onlineUseOffline')}
            </Button>
          </div>
        ) : (
          <form className={styles.form} onSubmit={submit}>
            <label className={styles.field}>
              <span>{t('cloudSettingsPassword')}</span>
              <input
                className={styles.input}
                type="password"
                value={password}
                autoComplete="current-password"
                autoFocus
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {failed ? (
              <div className={styles.error} role="alert">
                {t('cloudSettingsLoginFailed')}
              </div>
            ) : null}
            <Button type="submit" size="m" block disabled={busy || !password}>
              {t('cloudSettingsLogin')}
            </Button>
            <Button
              variant="outlined"
              size="m"
              block
              onClick={() => setAppMode('local')}
            >
              {t('onlineUseOffline')}
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
