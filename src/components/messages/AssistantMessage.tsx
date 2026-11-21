import { useTranslate } from '../../i18n/index.js'
import clsx from 'clsx'
import { memo, useEffect, useRef } from 'react'
import { IconRefreshOutline16, IconWarningOutline16 } from '../base/icons.js'
import { describeReply } from '../../services/chat/describe.js'
import { canContinueReply } from '../../services/chat/reply.js'
import { continueReply, regenerateReply } from '../../services/chat/store.js'
import {
  appendStreamReadAloud,
  describeReadAloudError,
  endStreamReadAloud,
  primeReadAloud,
  startStreamReadAloud,
  stopReadAloud,
  toggleReadAloud,
} from '../../services/speech/readAloud.js'
import { useSettings } from '../../services/settings.js'
import { ONLINE_MODE } from '../../services/online/mode.js'
import { showToast } from '../base/toastState.js'
import type { AssistantMessage as AssistantMessageType } from '../../services/chat/types.js'
import { openSettings } from '../settings/settingsDialogState.js'
import { IconButton } from '../base/IconButton.js'
import { Button } from '../base/Button.js'
import { Markdown } from '../markdown/Markdown.js'
import { SiteThumbnails } from '../search/SiteLogo.js'
import { toggleSearchPanel, useSearchPanel } from '../search/searchPanelState.js'
import { ReadAloudButton } from './ReadAloudButton.js'
import { CopyButton } from './CopyButton.js'
import { ReplyArea } from './ReplyArea.js'
import { SensitiveReply } from './SensitiveReply.js'
import { useReplyView } from './useReplyView.js'
import {
  BranchSwitcher,
  type MessageVersions,
  type SelectMessageVersion,
} from './BranchSwitcher.js'
import styles from './AssistantMessage.module.css'

const TOP_UP_URL = 'https://platform.deepseek.com/top_up'

export const AssistantMessage = memo(function AssistantMessage({
  sessionId,
  message,
  isLast,
  streaming,
  busy,
  readOnly = false,
  versions,
  onSelectVersion,
}: {
  sessionId: string
  message: AssistantMessageType
  isLast: boolean
  streaming: boolean
  busy: boolean
  readOnly?: boolean
  versions: MessageVersions
  onSelectVersion: SelectMessageVersion
}) {
  const t = useTranslate()
  const view = useReplyView(message, streaming)
  const panelEntry = useSearchPanel((state) => state.entry)
  const notice = streaming ? null : describeReply(message)
  // 安全拒绝：思考和正文已移入 redacted，只显示敏感提示，展开后可阅读原文。
  const refused = message.stopReason === 'refusal'
  const answer = refused ? null : view.answer
  const responseText = [answer?.text, notice?.presentation === 'response' ? notice.text : null]
    .filter(Boolean)
    .join('\n\n')
  const copyText = responseText || notice?.text
  const waiting = streaming && view.steps.length === 0 && !view.answer && !message.thinking
  const summaryEntry = `${message.id}-summary`

  const autoRead = useSettings((state) => state.autoRead)
  const autoReadMode = useSettings((state) => state.autoReadMode)
  const answerText = answer?.text ?? ''
  const previousStatus = useRef(message.status)
  const wasStreaming = useRef(message.status === 'pending' || message.status === 'streaming')
  const streamActive = useRef(false)
  const streamSeen = useRef('')
  const streamPending = useRef('')

  // 完成后自动朗读：只在本次挂载内从生成中变为 done 时触发
  useEffect(() => {
    const previous = previousStatus.current
    previousStatus.current = message.status
    if (!autoRead || autoReadMode !== 'done' || !isLast || message.status !== 'done') {
      return
    }
    if (previous !== 'pending' && previous !== 'streaming') {
      return
    }
    if (!answerText || refused || document.visibilityState !== 'visible') {
      return
    }
    try {
      toggleReadAloud(message.id, answerText, (error) =>
        showToast(describeReadAloudError(error))
      )
    } catch (error) {
      showToast(describeReadAloudError(error))
    }
  }, [autoRead, autoReadMode, answerText, isLast, message.id, message.status, refused])

  // 流式自动朗读：按句子或长度切块，边生成边排队合成
  useEffect(() => {
    const streamingNow = message.status === 'pending' || message.status === 'streaming'
    if (streamingNow) {
      wasStreaming.current = true
    }
    const active = autoRead && autoReadMode === 'stream' && isLast && !refused
    const flush = () => {
      const chunk = streamPending.current
      streamPending.current = ''
      if (chunk) {
        appendStreamReadAloud(message.id, chunk)
      }
    }
    const stopStream = () => {
      if (!streamActive.current) {
        return
      }
      stopReadAloud()
      streamActive.current = false
      streamSeen.current = ''
      streamPending.current = ''
    }

    if (!active) {
      stopStream()
      if (!streamingNow) {
        wasStreaming.current = false
      }
      return
    }
    if (message.status === 'stopped' || message.status === 'error') {
      stopStream()
      wasStreaming.current = false
      return
    }
    if (!streamActive.current) {
      if (message.status === 'done') {
        // 极短回复还没建立流式会话就结束：补读一次全文
        if (wasStreaming.current && answerText && document.visibilityState === 'visible') {
          try {
            toggleReadAloud(message.id, answerText, (error) =>
              showToast(describeReadAloudError(error))
            )
          } catch (error) {
            showToast(describeReadAloudError(error))
          }
        }
        wasStreaming.current = false
        return
      }
      if (!answerText || document.visibilityState !== 'visible') {
        return
      }
      try {
        startStreamReadAloud(message.id, (error) =>
          showToast(describeReadAloudError(error))
        )
      } catch (error) {
        showToast(describeReadAloudError(error))
        return
      }
      streamActive.current = true
      streamSeen.current = ''
      streamPending.current = ''
    }
    if (answerText.startsWith(streamSeen.current)) {
      const delta = answerText.slice(streamSeen.current.length)
      streamSeen.current = answerText
      streamPending.current += delta
      if (/[。！？.!?\n]/.test(delta) || streamPending.current.length >= 80) {
        flush()
      }
    } else {
      // 文本被整体替换时只重新同步，避免重复朗读
      streamSeen.current = answerText
    }
    if (message.status === 'done') {
      flush()
      endStreamReadAloud(message.id)
      streamActive.current = false
      streamSeen.current = ''
      streamPending.current = ''
      wasStreaming.current = false
    }
  }, [autoRead, autoReadMode, answerText, isLast, message.id, message.status, refused])

  // 消息卸载（切换会话/分支、进入统计页等）时停止本次流式自动朗读
  useEffect(
    () => () => {
      if (streamActive.current) {
        streamActive.current = false
        stopReadAloud()
      }
    },
    []
  )

  return (
    <div className={styles.message}>
      {refused ? null : (
        <ReplyArea
          message={message}
          view={view}
          streaming={streaming}
          hasResponse={!!responseText}
        />
      )}
      {answer ? (
        <Markdown
          className="ds-assistant-message-main-content"
          content={answer.markdown}
          loading={streaming}
          cacheKey={message.id}
          disableLink={false}
          sources={view.sources}
        />
      ) : null}
      {waiting ? (
        <div className={styles.waiting}>
          {[0, 1, 2].map((index) => (
            <span key={index} className={styles.waitingDot} />
          ))}
        </div>
      ) : null}
      {refused ? (
        <SensitiveReply message={message} />
      ) : notice?.presentation === 'response' ? (
        <Markdown
          className="ds-assistant-message-main-content"
          content={notice.text}
          loading={false}
          cacheKey={`${message.id}-template`}
          disableLink={false}
        />
      ) : notice ? (
        <div className={styles.notice}>
          <IconWarningOutline16 />
          <span>
            {notice.text}
            {notice.action === 'apiKey' && !ONLINE_MODE ? (
              <>
                {' '}
                <button
                  type="button"
                  className={styles.noticeAction}
                  onClick={() => openSettings('data')}
                >
                  {t('changeApiKey')}
                </button>
              </>
            ) : null}
            {notice.action === 'topUp' ? (
              <>
                {' '}
                <a
                  className={styles.noticeAction}
                  href={TOP_UP_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t('topUp')}
                </a>
              </>
            ) : null}
          </span>
        </div>
      ) : null}
      {!streaming && !refused && view.searchResults.length > 0 ? (
        <div
          className={clsx(styles.summary, panelEntry === summaryEntry && styles.summaryActive)}
          onClick={() => toggleSearchPanel(summaryEntry, view.searchResults)}
        >
          <SiteThumbnails sources={view.searchResults} />
          <span>
            {t(
              view.searchResults.length === 1 ? 'messageSearchSummary' : 'messageSearchSummaries',
              { count: view.searchResults.length }
            )}
          </span>
        </div>
      ) : null}
      {streaming ? null : (
        <div className={styles.bottom}>
          <BranchSwitcher versions={versions} disabled={busy} onSelect={onSelectVersion} />
          <div className={clsx(styles.actions, isLast && styles.alwaysShow)}>
            {copyText ? <CopyButton text={copyText} /> : null}
            {responseText && !refused ? (
              <ReadAloudButton messageId={message.id} text={responseText} />
            ) : null}
            <IconButton
              icon={<IconRefreshOutline16 />}
              tooltip={t('regenerate')}
              tooltipPlacement="bottom"
              disabled={busy || refused || readOnly}
              onClick={() => {
                stopReadAloud()
                if (autoRead) {
                  primeReadAloud()
                }
                regenerateReply(sessionId, message.id)
              }}
            />
          </div>
          {isLast && !readOnly && canContinueReply(message) ? (
            <Button
              variant="outlined"
              size="s"
              className={styles.continueButton}
              disabled={busy}
              onClick={() => {
                stopReadAloud()
                if (autoRead) {
                  primeReadAloud()
                }
                continueReply(sessionId, message.id)
              }}
            >
              {t('continueGenerating')}
            </Button>
          ) : null}
        </div>
      )}
    </div>
  )
})
