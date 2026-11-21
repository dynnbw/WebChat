import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useTranslate } from '../../i18n/index.js'
import type { StatsBucket } from '../../services/stats.js'
import {
  CHART_PADDING,
  formatCompact,
  formatFull,
  labelIndexes,
  makeTicks,
  useElementSize,
} from './chartUtils.js'
import styles from './StatsView.module.css'

const totalOf = (bucket: StatsBucket) =>
  bucket.cachedInput + bucket.uncachedInput + bucket.output

/** Token 堆叠柱状图：命中缓存 / 未命中缓存 / 输出。 */
export const StackedBarChart = ({
  buckets,
  ariaLabel,
}: {
  buckets: StatsBucket[]
  ariaLabel: string
}) => {
  const t = useTranslate()
  const containerRef = useRef<HTMLDivElement>(null)
  const { width, height } = useElementSize(containerRef)
  const [hover, setHover] = useState<number | null>(null)
  const { top, right, bottom, left } = CHART_PADDING
  const plotWidth = Math.max(0, width - left - right)
  const plotHeight = Math.max(0, height - top - bottom)
  const totals = buckets.map(totalOf)
  const max = totals.length > 0 ? Math.max(...totals) : 0
  const ticks = makeTicks(max)
  const band = plotWidth / Math.max(buckets.length, 1)
  const gap = band > 4 ? 2 : 0
  const barWidth = Math.max(1, band - gap)
  const xFor = (index: number) => left + index * band + (band - barWidth) / 2
  const xCenter = (index: number) => left + (index + 0.5) * band
  const base = top + plotHeight
  const heightFor = (value: number) =>
    ticks.top > 0 ? (value / ticks.top) * plotHeight : 0
  const labels = labelIndexes(buckets.length)
  const activeBucket = hover === null ? undefined : buckets[hover]
  const tooltipLeft =
    hover === null
      ? 0
      : Math.min(Math.max(xCenter(hover), 90), Math.max(90, width - 90))

  const onPointer = (event: ReactPointerEvent<SVGRectElement>) => {
    if (buckets.length === 0) {
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0) {
      return
    }
    const ratio = (event.clientX - rect.left) / rect.width
    const index = Math.floor(ratio * buckets.length)
    setHover(Math.min(Math.max(index, 0), buckets.length - 1))
  }

  return (
    <div ref={containerRef} className={styles.chart}>
      {width > 0 && height > 0 ? (
        <>
          <svg width={width} height={height} role="img" aria-label={ariaLabel}>
            {ticks.values.map((value) => (
              <g key={value}>
                <line
                  x1={left}
                  x2={width - right}
                  y1={base - heightFor(value)}
                  y2={base - heightFor(value)}
                  className={styles.gridLine}
                />
                <text
                  x={left - 8}
                  y={base - heightFor(value)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className={styles.axisLabel}
                >
                  {formatCompact(value)}
                </text>
              </g>
            ))}
            {hover !== null ? (
              <rect
                x={left + hover * band}
                y={top}
                width={band}
                height={plotHeight}
                className={styles.bandHover}
              />
            ) : null}
            {buckets.map((bucket, index) => {
              const cachedHeight = heightFor(bucket.cachedInput)
              const uncachedHeight = heightFor(bucket.uncachedInput)
              const outputHeight = heightFor(bucket.output)
              const cachedY = base - cachedHeight
              const uncachedY = cachedY - uncachedHeight
              const outputY = uncachedY - outputHeight
              const x = xFor(index)
              return (
                <g key={bucket.key}>
                  {cachedHeight > 0 ? (
                    <rect
                      x={x}
                      y={cachedY}
                      width={barWidth}
                      height={cachedHeight}
                      className={styles.barCached}
                    />
                  ) : null}
                  {uncachedHeight > 0 ? (
                    <rect
                      x={x}
                      y={uncachedY}
                      width={barWidth}
                      height={uncachedHeight}
                      className={styles.barUncached}
                    />
                  ) : null}
                  {outputHeight > 0 ? (
                    <rect
                      x={x}
                      y={outputY}
                      width={barWidth}
                      height={outputHeight}
                      className={styles.barOutput}
                    />
                  ) : null}
                </g>
              )
            })}
            {buckets.map((bucket, index) =>
              labels.has(index) ? (
                <text
                  key={bucket.key}
                  x={xCenter(index)}
                  y={height - 8}
                  textAnchor="middle"
                  className={styles.axisLabel}
                >
                  {bucket.label}
                </text>
              ) : null
            )}
            <rect
              x={left}
              y={top}
              width={plotWidth}
              height={plotHeight}
              fill="transparent"
              pointerEvents="all"
              onPointerMove={onPointer}
              onPointerDown={onPointer}
              onPointerLeave={() => setHover(null)}
            />
          </svg>
          {activeBucket ? (
            <div className={styles.tooltip} style={{ left: tooltipLeft }}>
              <div className={styles.tooltipHead}>
                <span>{activeBucket.label}</span>
                <span>{formatFull(totalOf(activeBucket))}</span>
              </div>
              <div className={styles.tooltipRow}>
                <span className={styles.tooltipLabel}>
                  <span className={styles.swatchCached} />
                  {t('statsInputCached')}
                </span>
                <span className={styles.tooltipValue}>{formatFull(activeBucket.cachedInput)}</span>
              </div>
              <div className={styles.tooltipRow}>
                <span className={styles.tooltipLabel}>
                  <span className={styles.swatchUncached} />
                  {t('statsInputUncached')}
                </span>
                <span className={styles.tooltipValue}>{formatFull(activeBucket.uncachedInput)}</span>
              </div>
              <div className={styles.tooltipRow}>
                <span className={styles.tooltipLabel}>
                  <span className={styles.swatchOutput} />
                  {t('statsOutput')}
                </span>
                <span className={styles.tooltipValue}>{formatFull(activeBucket.output)}</span>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
