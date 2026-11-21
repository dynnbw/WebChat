import type { FileAttachment, Session } from '../chat/types.js'
import * as db from '../chat/db.js'
import { useSettings } from '../settings.js'
import { showToast } from '../../components/base/toastState.js'
import { cloudPutSession, cloudUploadImage } from './client.js'

const SYNC_DELAY = 800
const ERROR_TOAST_INTERVAL = 30_000

const timers = new Map<string, ReturnType<typeof setTimeout>>()
const syncing = new Set<string>()
const lastErrorAt = new Map<string, number>()

const hasActiveReply = (session: Session) =>
  session.messages.some(
    (message) =>
      message.role === 'assistant' &&
      (message.status === 'pending' || message.status === 'streaming')
  )

const uploadedKey = (origin: string) => `chat-demo:cloud-uploaded-files:${origin}`

const readUploaded = (origin: string): Set<string> => {
  try {
    const raw = localStorage.getItem(uploadedKey(origin))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

const writeUploaded = (origin: string, ids: Set<string>) => {
  try {
    localStorage.setItem(uploadedKey(origin), JSON.stringify([...ids]))
  } catch {
    // 存储不可用时只影响下次重复上传
  }
}

const imageFiles = (session: Session): Map<string, FileAttachment> => {
  const files = new Map<string, FileAttachment>()
  for (const message of session.messages) {
    if (message.role !== 'user') {
      continue
    }
    for (const file of message.files) {
      if (file.isImage) {
        files.set(file.id, file)
      }
    }
  }
  return files
}

const reportSyncError = (sessionId: string, error: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[cloud sync]', error)
  const now = Date.now()
  const last = lastErrorAt.get(sessionId) ?? 0
  if (now - last >= ERROR_TOAST_INTERVAL) {
    lastErrorAt.set(sessionId, now)
    showToast({ key: 'cloudSyncFailed', type: 'error' })
  }
}

/** 上传同步会话：先补齐图片原件，再整体覆盖云端会话 */
export const syncSessionNow = async (session: Session): Promise<void> => {
  if (!session.cloudSync || hasActiveReply(session)) {
    return
  }
  const { cloudOrigin, cloudToken } = useSettings.getState()
  if (!cloudOrigin || !cloudToken) {
    return
  }
  if (syncing.has(session.id)) {
    return
  }
  syncing.add(session.id)
  try {
    const uploaded = readUploaded(cloudOrigin)
    const images = imageFiles(session)
    for (const [id, file] of images) {
      if (uploaded.has(id)) {
        continue
      }
      const blob = await db.loadFile(id)
      if (!blob) {
        continue
      }
      await cloudUploadImage(cloudOrigin, cloudToken, id, blob, file.name)
      uploaded.add(id)
      writeUploaded(cloudOrigin, uploaded)
    }
    let result = await cloudPutSession(cloudOrigin, cloudToken, 'backup', session)
    // 云端备份被手动删除后图片可能已被回收；按服务端提示补传一次
    const missing = result.missingFiles ?? []
    if (missing.length > 0) {
      let uploadedAny = false
      for (const id of missing) {
        const file = images.get(id)
        if (!file) {
          continue
        }
        const blob = await db.loadFile(id)
        if (!blob) {
          continue
        }
        await cloudUploadImage(cloudOrigin, cloudToken, id, blob, file.name)
        uploaded.add(id)
        uploadedAny = true
      }
      if (uploadedAny) {
        writeUploaded(cloudOrigin, uploaded)
        result = await cloudPutSession(cloudOrigin, cloudToken, 'backup', session)
      }
    }
  } catch (error) {
    reportSyncError(session.id, error)
  } finally {
    syncing.delete(session.id)
  }
}

export const cancelCloudSync = (sessionId: string) => {
  const timer = timers.get(sessionId)
  if (timer) {
    clearTimeout(timer)
    timers.delete(sessionId)
  }
}

/** 防抖触发；流式生成中不排期，结束后由 persist 再次调用 */
export const scheduleCloudSync = (session: Session) => {
  if (!session.cloudSync || hasActiveReply(session)) {
    return
  }
  const { cloudOrigin, cloudToken } = useSettings.getState()
  if (!cloudOrigin || !cloudToken) {
    return
  }
  const previous = timers.get(session.id)
  if (previous) {
    clearTimeout(previous)
  }
  const timer = setTimeout(() => {
    timers.delete(session.id)
    void syncSessionNow(session)
  }, SYNC_DELAY)
  timers.set(session.id, timer)
}
