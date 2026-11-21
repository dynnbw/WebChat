import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { StatsBucket } from '../../services/stats.js'
import {
  CHART_PADDING,
  formatCompact,
  formatFull,
  labelIndexes,
  linePath,
  makeTicks,
  useElementSize,
} from './chartUtils.js'
import styles from './StatsView.module.css'

/** 请求次数面积图：按时间桶绘制曲线和半透明填充。 */
export const AreaChart = ({
  buckets,
  ariaLabel,
  metric = 'requests',
  label,
}: {
  buckets: StatsBucket[]
  ariaLabel: string
  metric?: 'requests' | 'searches'
  label: string
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const { width, height } = useElementSize(containerRef)
  const [hover, setHover] = useState<number | null>(null)
  const { top, right, bottom, left } = CHART_PADDING
  const plotWidth = Math.max(0, width - left - right)
  const plotHeight = Math.max(0, height - top - bottom)
  const values = buckets.map((bucket) => bucket[metric])
  const max = values.length > 0 ? Math.max(...values) : 0
  const ticks = makeTicks(max, 4, true)
  const xAt = (index: number) =>
    buckets.length <= 1 ? left + plotWidth / 2 : left + (index / (buckets.length - 1)) * plotWidth
  const yAt = (value: number) =>
    top + plotHeight - (ticks.top > 0 ? (value / ticks.top) * plotHeight : 0)
  const points = values.map((value, index) => ({ x: xAt(index), y: yAt(value) }))
  // 只有一个时间桶时把面积铺满整个绘图区，否则单点路径不可见。
  const linePoints =
    buckets.length === 1 && values[0] !== undefined
      ? [
          { x: left, y: yAt(values[0]) },
          { x: left + plotWidth, y: yAt(values[0]) },
        ]
      : points
  const first = linePoints[0]
  const last = linePoints.at(-1)
  const line = linePath(linePoints)
  const area =
    first && last
      ? `${line} L ${last.x} ${top + plotHeight} L ${first.x} ${top + plotHeight} Z`
      : ''
  const labels = labelIndexes(buckets.length)
  const activeBucket = hover === null ? undefined : buckets[hover]
  const activePoint =
    hover === null
      ? undefined
      : buckets.length === 1 && values[0] !== undefined
        ? { x: left + plotWidth / 2, y: yAt(values[0]) }
        : points[hover]
  const tooltipLeft = activePoint
    ? Math.min(Math.max(activePoint.x, 90), Math.max(90, width - 90))
    : 0

  const onPointer = (event: ReactPointerEvent<SVGRectElement>) => {
    if (buckets.length === 0) {
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width === 0) {
      return
    }
    const ratio = (event.clientX - rect.left) / rect.width
    const index = buckets.length <= 1 ? 0 : Math.round(ratio * (buckets.length - 1))
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
                  y1={yAt(value)}
                  y2={yAt(value)}
                  className={styles.gridLine}
                />
                <text
                  x={left - 8}
                  y={yAt(value)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className={styles.axisLabel}
                >
                  {formatCompact(value)}
                </text>
              </g>
            ))}
            <path d={area} className={styles.areaFill} />
            <path d={line} className={styles.areaLine} />
            {buckets.map((bucket, index) =>
              labels.has(index) ? (
                <text
                  key={bucket.key}
                  x={xAt(index)}
                  y={height - 8}
                  textAnchor="middle"
                  className={styles.axisLabel}
                >
                  {bucket.label}
                </text>
              ) : null
            )}
            {activePoint ? (
              <>
                <line
                  x1={activePoint.x}
                  x2={activePoint.x}
                  y1={top}
                  y2={top + plotHeight}
                  className={styles.hoverLine}
                />
                <circle
                  cx={activePoint.x}
                  cy={activePoint.y}
                  r={4}
                  className={styles.hoverDot}
                />
              </>
            ) : null}
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
              <div className={styles.tooltipTitle}>{activeBucket.label}</div>
              <div className={styles.tooltipRow}>
                <span>{label}</span>
                <span className={styles.tooltipValue}>{formatFull(activeBucket[metric])}</span>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
