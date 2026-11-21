import { create } from 'zustand'
import type { TranslationMessage } from '../../i18n/index.js'
import { ApiError } from '../api/client.js'
import { classifyApiError } from '../api/errors.js'
import { synthesize, TTS_SAMPLE_RATE } from '../api/speech.js'
import { useSettings } from '../settings.js'

/**
 * 朗读：同一时间只读一条回复。
 * 请求 TTS 的裸 PCM 流，边收边用 AudioContext 按顺序排程播放，首帧到达即出声。
 * 支持整段朗读（手动）和流式分段朗读（自动朗读）。
 * 状态：loading（已请求、未出声）→ playing → 结束回到 idle。
 */
export type ReadAloudStatus = 'idle' | 'loading' | 'playing'

type ReadAloudState = {
  /** 正在朗读的回复 id */
  messageId: string | null
  status: ReadAloudStatus
}

export const useReadAloud = create<ReadAloudState>(() => ({ messageId: null, status: 'idle' }))

/** 首帧前多缓冲一点，减少网络抖动造成的断续 */
const START_DELAY = 0.1

type ReadSession = {
  messageId: string
  controller: AbortController
  gain: GainNode
  queue: string[]
  ended: boolean
  pumping: boolean
  /** 下一段音频的最早开始时间；0 表示还没排过 */
  nextTime: number
  /** 已排程但还没结束的音频源数量 */
  sources: number
  onError: (error: unknown) => void
}

let current: ReadSession | null = null
/** 复用同一个 AudioContext；在用户手势中 prime 后可跨多次自动朗读继续出声 */
let audioContext: AudioContext | null = null

const getContext = (): AudioContext => {
  if (!audioContext || audioContext.state === 'closed') {
    audioContext = new AudioContext({ sampleRate: TTS_SAMPLE_RATE })
  }
  return audioContext
}

/** 在用户手势中提前创建/恢复 AudioContext，让后续自动朗读不受自动播放策略影响 */
export const primeReadAloud = () => {
  try {
    const context = getContext()
    void context.resume().catch(() => {})
  } catch {
    // 非安全上下文或不支持 AudioContext 时静默失败
  }
}

const setStatus = (session: ReadSession, status: ReadAloudStatus) => {
  if (current === session) {
    useReadAloud.setState({ messageId: session.messageId, status })
  }
}

const finish = (session: ReadSession) => {
  if (current !== session) {
    return
  }
  session.controller.abort()
  // 断开增益节点即可停下所有已排程音频，AudioContext 留给下一次朗读
  session.gain.disconnect()
  current = null
  useReadAloud.setState({ messageId: null, status: 'idle' })
}

/** 停止当前朗读（发送、停止生成、切换会话等场景调用） */
export const stopReadAloud = () => {
  if (current) {
    finish(current)
  }
}

const maybeFinish = (session: ReadSession) => {
  if (current !== session) {
    return
  }
  if (session.ended && !session.pumping && session.queue.length === 0 && session.sources === 0) {
    finish(session)
  }
}

/** 16-bit 小端 PCM 转成 Float32；奇数字节留到下一段 */
const toFloat32 = (bytes: Uint8Array) => {
  const samples = new Float32Array(bytes.length >> 1)
  const view = new DataView(bytes.buffer, bytes.byteOffset, samples.length * 2)
  for (let i = 0; i < samples.length; i++) {
    samples[i] = view.getInt16(i * 2, true) / 0x8000
  }
  return samples
}

const pump = async (session: ReadSession) => {
  if (session.pumping || current !== session) {
    return
  }
  session.pumping = true
  try {
    while (current === session && session.queue.length > 0) {
      const text = session.queue.shift()
      if (text === undefined) {
        break
      }
      const { apiKey, ttsVoice } = useSettings.getState()
      const stream = await synthesize(apiKey ?? '', text, ttsVoice, session.controller.signal)
      const context = getContext()
      const reader = stream.getReader()
      session.controller.signal.addEventListener(
        'abort',
        () => void reader.cancel().catch(() => {}),
        { once: true }
      )
      let rest = new Uint8Array(0)
      for (;;) {
        const { done, value } = await reader.read()
        if (done || current !== session) {
          break
        }
        const bytes = new Uint8Array(rest.length + value.length)
        bytes.set(rest)
        bytes.set(value, rest.length)
        const samples = toFloat32(bytes)
        rest = bytes.slice(samples.length * 2)
        if (samples.length === 0) {
          continue
        }
        const buffer = context.createBuffer(1, samples.length, TTS_SAMPLE_RATE)
        buffer.copyToChannel(samples, 0)
        const source = context.createBufferSource()
        source.buffer = buffer
        source.connect(session.gain)
        const startAt =
          session.nextTime === 0
            ? context.currentTime + START_DELAY
            : Math.max(session.nextTime, context.currentTime)
        source.start(startAt)
        session.nextTime = startAt + buffer.duration
        session.sources += 1
        source.onended = () => {
          session.sources -= 1
          maybeFinish(session)
        }
        setStatus(session, 'playing')
      }
    }
  } catch (error) {
    if (!session.controller.signal.aborted) {
      finish(session)
      session.onError(error)
    }
    return
  } finally {
    session.pumping = false
  }
  if (current === session && session.queue.length > 0) {
    void pump(session)
    return
  }
  maybeFinish(session)
}

const enqueue = (session: ReadSession, text: string) => {
  const clean = text.trim()
  if (!clean) {
    return
  }
  session.queue.push(clean)
  void pump(session)
}

const start = (messageId: string, onError: (error: unknown) => void): ReadSession => {
  stopReadAloud()
  const context = getContext()
  void context.resume().catch(() => {})
  const gain = context.createGain()
  gain.connect(context.destination)
  const session: ReadSession = {
    messageId,
    controller: new AbortController(),
    gain,
    queue: [],
    ended: false,
    pumping: false,
    nextTime: 0,
    sources: 0,
    onError,
  }
  current = session
  useReadAloud.setState({ messageId, status: 'loading' })
  return session
}

export const describeReadAloudError = (error: unknown): TranslationMessage | string => {
  if (error instanceof ApiError && error.kind === 'protocol') {
    return error.message
  }
  // 400 表示这段正文服务端无法合成，与其余失败区分开
  if (error instanceof ApiError && error.status === 400) {
    return { key: 'ttsUnavailable' }
  }
  switch (classifyApiError(error)) {
    case 'unauthorized':
      return { key: 'apiKeyInvalidRetry' }
    case 'insufficientBalance':
      return { key: 'insufficientBalance' }
    case 'rateLimited':
      return { key: 'rateLimited' }
    default:
      return { key: 'ttsFailed' }
  }
}

/**
 * 开始朗读一条回复的正文；同一条正在朗读时调用等于停止。
 * 必须在点击事件中同步调用（或先 primeReadAloud）：AudioContext 需要用户手势才能出声。
 */
export const toggleReadAloud = (
  messageId: string,
  text: string,
  onError: (error: unknown) => void
) => {
  if (useReadAloud.getState().messageId === messageId) {
    stopReadAloud()
    return
  }
  const session = start(messageId, onError)
  enqueue(session, text)
  session.ended = true
  maybeFinish(session)
}

/** 自动朗读：流式开始；之后的增量通过 appendStreamReadAloud 追加 */
export const startStreamReadAloud = (
  messageId: string,
  onError: (error: unknown) => void
) => {
  if (useReadAloud.getState().messageId === messageId) {
    return
  }
  start(messageId, onError)
}

export const appendStreamReadAloud = (messageId: string, text: string) => {
  const session = current
  if (!session || session.messageId !== messageId || session.ended) {
    return
  }
  enqueue(session, text)
}

export const endStreamReadAloud = (messageId: string) => {
  const session = current
  if (!session || session.messageId !== messageId) {
    return
  }
  session.ended = true
  maybeFinish(session)
}
