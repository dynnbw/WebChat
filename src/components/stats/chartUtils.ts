import { useLayoutEffect, useState, type RefObject } from 'react'

export type ChartSize = { width: number; height: number }
export type ChartPadding = { top: number; right: number; bottom: number; left: number }
export type Point = { x: number; y: number }
export type Ticks = { top: number; values: number[] }

export const CHART_PADDING: ChartPadding = { top: 16, right: 12, bottom: 28, left: 48 }

const compactFormatter = new Intl.NumberFormat('en-US', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

export const formatFull = (value: number): string => Math.round(value).toLocaleString('en-US')

export const formatCompact = (value: number): string =>
  value === 0 ? '0' : compactFormatter.format(value)

/** 生成从 0 开始的整齐刻度，并返回刻度上界；integer 用于请求次数这类整数指标。 */
export const makeTicks = (max: number, count = 4, integer = false): Ticks => {
  if (!Number.isFinite(max) || max <= 0) {
    return { top: 1, values: [0, 1] }
  }
  const rough = max / count
  const magnitude = 10 ** Math.floor(Math.log10(rough))
  const normalized = rough / magnitude
  const rawStep =
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude
  const step = integer ? Math.max(1, Math.ceil(rawStep)) : rawStep
  const top = Math.ceil(max / step) * step
  const values: number[] = []
  for (let value = 0; value <= top + step / 2; value += step) {
    values.push(value)
  }
  return { top, values }
}

/** 选择需要显示标签的桶下标，并尽量保留最后一个。 */
export const labelIndexes = (count: number, maxLabels = 6): Set<number> => {
  const indexes = new Set<number>()
  if (count <= 0) {
    return indexes
  }
  const step = Math.max(1, Math.ceil(count / maxLabels))
  for (let index = 0; index < count; index += step) {
    indexes.add(index)
  }
  indexes.add(count - 1)
  return indexes
}

/** 用二次曲线把相邻点连成平滑折线。 */
export const linePath = (points: Point[]): string => {
  const first = points[0]
  if (!first) {
    return ''
  }
  let path = `M ${first.x} ${first.y}`
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const point = points[index]
    if (!previous || !point) {
      continue
    }
    const middle = (previous.x + point.x) / 2
    path += ` C ${middle} ${previous.y}, ${middle} ${point.y}, ${point.x} ${point.y}`
  }
  return path
}

export const useElementSize = <T extends HTMLElement>(ref: RefObject<T>): ChartSize => {
  const [size, setSize] = useState<ChartSize>({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) {
      return
    }
    const update = () => setSize({ width: element.clientWidth, height: element.clientHeight })
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  return size
}
