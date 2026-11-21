import { useId, useState } from 'react'
import { useTranslate } from '../../i18n/index.js'
import type { AssistantMessage, TextPart, ThinkingPart } from '../../services/chat/types.js'
import {
  IconChevronDownOutline14,
  IconChevronRightOutline14,
  IconWarningOutline16,
} from '../base/icons.js'
import { Markdown } from '../markdown/Markdown.js'
import styles from './SensitiveReply.module.css'
import './thinking.markdown.css'

const textOf = (blocks: AssistantMessage['redacted']): string =>
  blocks?.filter((block): block is TextPart => block.type === 'text').map((block) => block.text).join('') ??
  ''

const thinkingOf = (blocks: AssistantMessage['redacted']): string =>
  blocks
    ?.filter((block): block is ThinkingPart => block.type === 'thinking')
    .map((block) => block.thinking)
    .join('') ?? ''

const templateOf = (message: AssistantMessage): string =>
  message.blocks
    .filter((block): block is TextPart => block.type === 'text' && block.isTemplate === true)
    .map((block) => block.text)
    .join('')

/** 安全拒绝：默认收起，展开后按模板、思考、正文分区展示本地保留的原文。 */
export const SensitiveReply = ({ message }: { message: AssistantMessage }) => {
  const t = useTranslate()
  const detailId = useId()
  const [open, setOpen] = useState(false)
  const template = templateOf(message)
  const thinking = thinkingOf(message.redacted)
  const answer = textOf(message.redacted)
  const hasDetail = template.trim() !== '' || thinking.trim() !== '' || answer.trim() !== ''
  return (
    <div className={styles.sensitive}>
      <div className={styles.header}>
        <IconWarningOutline16 />
        <span className={styles.title}>{t('replySensitive')}</span>
        {hasDetail ? (
          <button
            type="button"
            className={styles.toggle}
            aria-expanded={open}
            aria-controls={detailId}
            onClick={() => setOpen((value) => !value)}
          >
            {t(open ? 'replySensitiveCollapse' : 'replySensitiveExpand')}
            {open ? <IconChevronDownOutline14 /> : <IconChevronRightOutline14 />}
          </button>
        ) : null}
      </div>
      {open && hasDetail ? (
        <div id={detailId} className={styles.detail}>
          {template.trim() ? (
            <section className={styles.section}>
              <div className={styles.sectionLabel}>{t('replySensitiveTemplate')}</div>
              <Markdown
                content={template}
                loading={false}
                cacheKey={`${message.id}-sensitive-template`}
                disableLink={false}
              />
            </section>
          ) : null}
          {thinking.trim() ? (
            <details className={styles.thinking}>
              <summary className={styles.sectionLabel}>{t('replySensitiveThinking')}</summary>
              <div className="ds-think-content">
                <Markdown
                  content={thinking}
                  loading={false}
                  cacheKey={`${message.id}-sensitive-thinking`}
                  disableLink
                />
              </div>
            </details>
          ) : null}
          {answer.trim() ? (
            <div className={styles.answer}>
              <Markdown
                content={answer}
                loading={false}
                cacheKey={`${message.id}-sensitive-answer`}
                disableLink={false}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
