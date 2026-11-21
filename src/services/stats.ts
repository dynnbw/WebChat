import type { ChatModel } from './api/types.js'
import type { AssistantMessage, Session } from './chat/types.js'

export type StatsRange = 'today' | '7d' | '30d' | 'all'
export type BucketUnit = 'hour' | 'day' | 'month'

export type StatsBucket = {
  key: string
  label: string
  requests: number
  searches: number
  cachedInput: number
  uncachedInput: number
  output: number
}

export type StatsData = {
  range: StatsRange
  unit: BucketUnit
  buckets: StatsBucket[]
  requests: number
  searches: number
  cachedInput: number
  uncachedInput: number
  output: number
  totalTokens: number
}

const HOUR = 3_600_000
const HOURLY_BUCKETS = 24
const DAILY_LIMIT = 90

const startOfDay = (time: number): number => {
  const date = new Date(time)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

const startOfNextDay = (time: number): number => {
  const date = new Date(startOfDay(time))
  date.setDate(date.getDate() + 1)
  return date.getTime()
}

const dayKey = (time: number): string => {
  const date = new Date(time)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

const monthKey = (time: number): string => {
  const date = new Date(time)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

const hourLabel = (hour: number): string => `${String(hour).padStart(2, '0')}:00`

const dayLabel = (time: number): string => {
  const date = new Date(time)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

const createBucket = (key: string, label: string): StatsBucket => ({
  key,
  label,
  requests: 0,
  searches: 0,
  cachedInput: 0,
  uncachedInput: 0,
  output: 0,
})

type Totals = {
  requests: number
  searches: number
  cachedInput: number
  uncachedInput: number
  output: number
}

const addTotals = (totals: Totals, message: AssistantMessage): void => {
  totals.requests += 1
  totals.searches += message.blocks.filter(
    (block) => block.type === 'server_tool_use' && block.name === 'deepseek_web_search'
  ).length
  const { usage } = message
  if (!usage) {
    return
  }
  totals.cachedInput += usage.cache_read_input_tokens
  totals.uncachedInput += usage.input_tokens + usage.cache_creation_input_tokens
  totals.output += usage.output_tokens
}

const collectReplies = (sessions: Session[]): AssistantMessage[] => {
  const replies: AssistantMessage[] = []
  for (const session of sessions) {
    for (const message of session.messages) {
      if (message.role === 'assistant') {
        replies.push(message)
      }
    }
  }
  return replies
}

const hourlyBuckets = (): StatsBucket[] =>
  Array.from({ length: HOURLY_BUCKETS }, (_, hour) =>
    createBucket(`hour-${hour}`, hourLabel(hour))
  )

const dailyBuckets = (start: number, days: number): StatsBucket[] => {
  const buckets: StatsBucket[] = []
  const date = new Date(start)
  for (let index = 0; index < days; index += 1) {
    buckets.push(createBucket(dayKey(date.getTime()), dayLabel(date.getTime())))
    date.setDate(date.getDate() + 1)
  }
  return buckets
}

const monthlyBuckets = (start: number, end: number): StatsBucket[] => {
  const buckets: StatsBucket[] = []
  const date = new Date(startOfDay(start))
  date.setDate(1)
  const last = new Date(startOfDay(end))
  last.setDate(1)
  while (date.getTime() <= last.getTime()) {
    buckets.push(createBucket(monthKey(date.getTime()), monthKey(date.getTime())))
    date.setMonth(date.getMonth() + 1)
  }
  return buckets
}

const countDays = (start: number, end: number): number => {
  let days = 0
  const date = new Date(start)
  while (date.getTime() <= end && days <= DAILY_LIMIT) {
    days += 1
    date.setDate(date.getDate() + 1)
  }
  return days
}

/** 汇总各时间范围内的请求次数与 token 用量；包含所有分支的助手消息。 */
export const computeStats = (
  sessions: Session[],
  range: StatsRange,
  modelFilter: ChatModel | 'all' = 'all',
  now = Date.now()
): StatsData => {
  const replies = collectReplies(sessions)
  let unit: BucketUnit = 'hour'
  let buckets: StatsBucket[] = []
  let from = startOfDay(now)
  let to = startOfNextDay(now)
  let bucketKey: (time: number) => string

  if (range === 'today') {
    unit = 'hour'
    buckets = hourlyBuckets()
    bucketKey = (time) => {
      const hour = Math.floor((time - from) / HOUR)
      return `hour-${hour}`
    }
  } else if (range === '7d' || range === '30d') {
    unit = 'day'
    const days = range === '7d' ? 7 : 30
    const first = new Date(to)
    first.setDate(first.getDate() - days)
    from = first.getTime()
    buckets = dailyBuckets(from, days)
    bucketKey = (time) => dayKey(time)
  } else {
    if (replies.length === 0) {
      return {
        range,
        unit: 'day',
        buckets: [],
        requests: 0,
        searches: 0,
        cachedInput: 0,
        uncachedInput: 0,
        output: 0,
        totalTokens: 0,
      }
    }
    const earliest = replies.reduce(
      (minimum, reply) => Math.min(minimum, reply.createdAt),
      Number.POSITIVE_INFINITY
    )
    from = startOfDay(earliest)
    to = now + 1
    const days = countDays(from, startOfDay(now))
    if (days > DAILY_LIMIT) {
      unit = 'month'
      buckets = monthlyBuckets(from, now)
      bucketKey = (time) => monthKey(time)
    } else {
      unit = 'day'
      buckets = dailyBuckets(from, days)
      bucketKey = (time) => dayKey(time)
    }
  }

  const byKey = new Map(buckets.map((bucket) => [bucket.key, bucket]))
  for (const reply of replies) {
    if (reply.createdAt < from || reply.createdAt >= to) {
      continue
    }
    const model = reply.model ?? null
    if (modelFilter !== 'all' && model !== modelFilter) {
      continue
    }
    const bucket = byKey.get(bucketKey(reply.createdAt))
    if (bucket) {
      addTotals(bucket, reply)
    }
  }

  const totals = buckets.reduce(
    (sum, bucket) => ({
      requests: sum.requests + bucket.requests,
      searches: sum.searches + bucket.searches,
      cachedInput: sum.cachedInput + bucket.cachedInput,
      uncachedInput: sum.uncachedInput + bucket.uncachedInput,
      output: sum.output + bucket.output,
    }),
    { requests: 0, searches: 0, cachedInput: 0, uncachedInput: 0, output: 0 }
  )

  return {
    range,
    unit,
    buckets,
    ...totals,
    totalTokens: totals.cachedInput + totals.uncachedInput + totals.output,
  }
}
