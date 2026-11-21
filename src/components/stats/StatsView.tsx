import clsx from 'clsx'
import { useEffect, useMemo, useState } from 'react'
import { useTranslate, type TranslationKey } from '../../i18n/index.js'
import * as db from '../../services/chat/db.js'
import type { Session } from '../../services/chat/types.js'
import {
  computeStats,
  type StatsData,
  type StatsRange,
} from '../../services/stats.js'
import { Button } from '../base/Button.js'
import { IconButton } from '../base/IconButton.js'
import { IconArrowLeftOutline16, IconChartOutline16, IconRefreshOutline16 } from '../base/icons.js'
import { AreaChart } from './AreaChart.js'
import { StackedBarChart } from './StackedBarChart.js'
import { formatFull } from './chartUtils.js'
import { closeStats } from './statsViewState.js'
import styles from './StatsView.module.css'

const RANGES: readonly { value: StatsRange; key: TranslationKey }[] = [
  { value: 'today', key: 'statsRangeToday' },
  { value: '7d', key: 'statsRange7d' },
  { value: '30d', key: 'statsRange30d' },
  { value: 'all', key: 'statsRangeAll' },
]

const RequestPanel = ({ title, data }: { title: string; data: StatsData }) => {
  const t = useTranslate()
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2>{title}</h2>
        <span className={styles.total}>{formatFull(data.requests)}</span>
      </div>
      <AreaChart
        buckets={data.buckets}
        metric="requests"
        label={t('statsRequests')}
        ariaLabel={`${title}: ${formatFull(data.requests)}`}
      />
    </section>
  )
}

const TokenPanel = ({ title, data }: { title: string; data: StatsData }) => {
  const t = useTranslate()
  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <h2>{title}</h2>
        <span className={styles.total}>{formatFull(data.totalTokens)}</span>
      </div>
      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={styles.swatchCached} />
          {t('statsInputCached')}
        </span>
        <span className={styles.legendItem}>
          <span className={styles.swatchUncached} />
          {t('statsInputUncached')}
        </span>
        <span className={styles.legendItem}>
          <span className={styles.swatchOutput} />
          {t('statsOutput')}
        </span>
      </div>
      <StackedBarChart
        buckets={data.buckets}
        ariaLabel={`${title}: ${formatFull(data.totalTokens)}`}
      />
    </section>
  )
}

/** 数据统计：读取本地会话，按时间范围和模型聚合请求、搜索与 token 用量。 */
export const StatsView = ({ siderCollapsed = false }: { siderCollapsed?: boolean }) => {
  const t = useTranslate()
  const [range, setRange] = useState<StatsRange>('today')
  const [sessions, setSessions] = useState<Session[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    setFailed(false)
    db.loadAllSessions()
      .then((loaded) => {
        if (active) {
          setSessions(loaded)
          setLoading(false)
        }
      })
      .catch((error: unknown) => {
        if (active) {
          db.reportStorageError('read statistics')(error)
          setFailed(true)
          setLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [reloadToken])

  const data = useMemo(
    () =>
      sessions === null
        ? null
        : {
            flash: computeStats(sessions, range, 'deepseek-flash'),
            pro: computeStats(sessions, range, 'deepseek-v4-pro'),
            all: computeStats(sessions, range),
          },
    [sessions, range]
  )
  const allTime = useMemo(
    () => (sessions === null ? null : computeStats(sessions, 'all')),
    [sessions]
  )
  const reload = () => setReloadToken((value) => value + 1)

  return (
    <div className={styles.view}>
      <div className={styles.inner}>
        <header className={clsx(styles.header, siderCollapsed && styles.withCollapsedSider)}>
          <IconButton
            size="m"
            icon={<IconArrowLeftOutline16 />}
            tooltip={t('statsBack')}
            onClick={closeStats}
          />
          <h1 className={styles.title}>{t('statsTitle')}</h1>
          <div className={styles.ranges} role="group" aria-label={t('statsTitle')}>
            {RANGES.map((item) => (
              <button
                key={item.value}
                type="button"
                className={clsx(styles.range, range === item.value && styles.rangeActive)}
                aria-pressed={range === item.value}
                onClick={() => setRange(item.value)}
              >
                {t(item.key)}
              </button>
            ))}
          </div>
          <IconButton
            size="m"
            icon={<IconRefreshOutline16 />}
            tooltip={t('statsRefresh')}
            disabled={loading}
            onClick={reload}
          />
        </header>
        <p className={styles.hint}>{t('statsUsageHint')}</p>
        {loading ? (
          <div className={styles.state} role="status" aria-live="polite">
            {t('statsLoading')}
          </div>
        ) : failed ? (
          <div className={styles.state} role="alert">
            <span>{t('statsLoadFailed')}</span>
            <Button variant="outlined" size="s" onClick={reload}>
              {t('retry')}
            </Button>
          </div>
        ) : data && allTime ? (
          <>
            <div className={styles.summaryRow}>
              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>{t('statsAllTimeTokens')}</span>
                <span className={styles.summaryValue}>{formatFull(allTime.totalTokens)}</span>
                <span className={styles.summaryHint}>{t('statsAllTimeHint')}</span>
              </div>
              <div className={styles.summaryCard}>
                <span className={styles.summaryLabel}>{t('statsAllTimeSearches')}</span>
                <span className={styles.summaryValue}>{formatFull(allTime.searches)}</span>
                <span className={styles.summaryHint}>{t('statsAllTimeHint')}</span>
              </div>
            </div>
            {data.all.requests > 0 ? (
              <>
                <div className={styles.grid}>
                  <RequestPanel
                    title={`${t('statsRequests')} · ${t('modelFlash')}`}
                    data={data.flash}
                  />
                  <TokenPanel title={`${t('statsTokens')} · ${t('modelFlash')}`} data={data.flash} />
                  <RequestPanel
                    title={`${t('statsRequests')} · ${t('modelV4Pro')}`}
                    data={data.pro}
                  />
                  <TokenPanel
                    title={`${t('statsTokens')} · ${t('modelV4Pro')}`}
                    data={data.pro}
                  />
                </div>
                <section className={clsx(styles.panel, styles.searchPanel)}>
                  <div className={styles.panelHead}>
                    <h2>{t('statsSearches')}</h2>
                    <span className={styles.total}>{formatFull(data.all.searches)}</span>
                  </div>
                  <div className={styles.subMetrics}>
                    <span>
                      {t('modelFlash')}: {formatFull(data.flash.searches)}
                    </span>
                    <span>
                      {t('modelV4Pro')}: {formatFull(data.pro.searches)}
                    </span>
                    <span className={styles.searchHint}>{t('statsSearchHint')}</span>
                  </div>
                  <AreaChart
                    buckets={data.all.buckets}
                    metric="searches"
                    label={t('statsSearches')}
                    ariaLabel={`${t('statsSearches')}: ${formatFull(data.all.searches)}`}
                  />
                </section>
                <div className={styles.srOnly}>
                  <table>
                    <caption>{t('statsTitle')}</caption>
                    <thead>
                      <tr>
                        <th>{t('statsBucket')}</th>
                        <th>{t('statsRequests')}</th>
                        <th>{t('statsSearches')}</th>
                        <th>{t('statsInputCached')}</th>
                        <th>{t('statsInputUncached')}</th>
                        <th>{t('statsOutput')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.all.buckets.map((bucket) => (
                        <tr key={bucket.key}>
                          <th scope="row">{bucket.label}</th>
                          <td>{bucket.requests}</td>
                          <td>{bucket.searches}</td>
                          <td>{bucket.cachedInput}</td>
                          <td>{bucket.uncachedInput}</td>
                          <td>{bucket.output}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div className={styles.empty}>
                <span className={styles.emptyIcon}>
                  <IconChartOutline16 />
                </span>
                <div className={styles.emptyTitle}>{t('statsEmpty')}</div>
                <div className={styles.emptyHint}>{t('statsEmptyHint')}</div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}
