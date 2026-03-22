import { useCallback, useEffect, useRef, useState } from 'react'
import type { ActivityEvent } from '@/types/activity'
import { EVENT_CONFIG } from '@/types/activity'
import { useTypewriter, getLineParts } from '@/hooks/useTypewriter'
import type { TypewriterLine } from '@/hooks/useTypewriter'
import styles from './Terminal.module.css'

interface Props {
  events: ActivityEvent[]
  isLoading: boolean
  error: Error | null
}

export function Terminal({ events, isLoading, error }: Props) {
  const { lines, isAnimating, skipAnimation } = useTypewriter(events)
  const outputRef = useRef<HTMLDivElement | null>(null)
  const userScrolledRef = useRef(false)

  // Callback ref: attach scroll listener when .output div mounts
  const setOutputRef = useCallback((el: HTMLDivElement | null) => {
    outputRef.current = el
    if (!el) return
    el.addEventListener('scroll', () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      userScrolledRef.current = !atBottom
    }, { passive: true })
    el.scrollTop = el.scrollHeight
  }, [])

  // Auto-scroll to bottom when new lines appear (unless user scrolled away)
  useEffect(() => {
    if (outputRef.current && !userScrolledRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight
    }
  }, [lines.length])

  if (isLoading) {
    return (
      <div className={styles.terminal}>
        <div className={styles.loading}>
          <span className={styles.loadingLine}>
            {'> connecting to beef_diary'}
            <span className={styles.cursor}>{'\u258B'}</span>
          </span>
        </div>
      </div>
    )
  }

  if (error && events.length === 0) {
    return (
      <div className={styles.terminal}>
        <div className={styles.loading}>
          <span className={styles.loadingLine}>
            {'> connection failed. retrying...'}
          </span>
          <span className={styles.loadingLine}>
            {'> the butcher is temporarily unreachable.'}
          </span>
        </div>
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className={styles.terminal}>
        <div className={styles.loading}>
          <span className={styles.loadingLine}>
            {'> no entries yet.'}
          </span>
          <span className={styles.loadingLine}>
            {'> the butcher is sharpening his knives.'}
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      className={styles.terminal}
      onClick={isAnimating ? skipAnimation : undefined}
      style={isAnimating ? { cursor: 'pointer' } : undefined}
    >
      <div className={styles.output} ref={setOutputRef}>
        {lines.map((line) => (
          <div key={line.event.id}>
            <div
              className={`${styles.line} ${
                line.showCursor
                  ? styles.active
                  : line.isStatic
                    ? styles.static
                    : line.isComplete
                      ? styles.complete
                      : ''
              }`}
              data-category={EVENT_CONFIG[line.event.type].category}
              data-type={line.event.type}
            >
              <LineContent line={line} />
            </div>

            {line.isComplete &&
              (line.event.type === 'roast_ready' || line.event.type === 'posted') &&
              line.event.data?.['roastText'] != null && (
                <RoastCard event={line.event} />
              )}

            {line.isComplete && line.event.expandable && (
              <ExpandableBlock event={line.event} />
            )}
          </div>
        ))}
      </div>

      {isAnimating && (
        <div className={styles.skipHint} onClick={skipAnimation}>
          click to skip
        </div>
      )}
    </div>
  )
}

// --- Sub-components ---

const LABEL_CLASS_MAP: Record<string, string> = {
  action: styles.labelAction ?? '',
  thinking: styles.labelThinking ?? '',
  result: styles.labelResult ?? '',
  status: styles.labelStatus ?? '',
  engagement: styles.labelEngagement ?? '',
}

function LineContent({ line }: { line: TypewriterLine }) {
  const { event, displayText, showCursor } = line
  const config = EVENT_CONFIG[event.type]
  const { timePart, labelPart } = getLineParts(event)
  const timeEnd = timePart.length
  const labelEnd = timeEnd + labelPart.length

  const timeVisible = displayText.slice(0, Math.min(displayText.length, timeEnd))
  const labelVisible =
    displayText.length > timeEnd
      ? displayText.slice(timeEnd, Math.min(displayText.length, labelEnd))
      : ''
  const narrativeVisible =
    displayText.length > labelEnd ? displayText.slice(labelEnd) : ''

  // Split label into badge text and trailing padding
  const labelTrimmed = labelVisible.trimEnd()
  const labelPadding = labelVisible.slice(labelTrimmed.length)

  return (
    <>
      {timeVisible && <span className={styles.time}>{timeVisible}</span>}
      {labelTrimmed && (
        <span className={LABEL_CLASS_MAP[config.category] ?? ''}>{labelTrimmed}</span>
      )}
      {labelPadding && <span>{labelPadding}</span>}
      {narrativeVisible && (
        <span className={styles.narrative}>{narrativeVisible}</span>
      )}
      {showCursor && <span className={styles.cursor}>{'\u258B'}</span>}
    </>
  )
}

function RoastCard({ event }: { event: ActivityEvent }) {
  const roastText = event.data?.['roastText'] as string | undefined
  const verdict = event.data?.['verdict'] as string | undefined
  const score = event.data?.['score'] as number | undefined
  const target = event.data?.['target'] as string | undefined

  if (!roastText) return null

  const verdictClass =
    verdict === 'well-done'
      ? styles.verdictWellDone
      : verdict === 'medium-rare'
        ? styles.verdictMediumRare
        : styles.verdictRare

  return (
    <div className={styles.roastBlock}>
      <span className={styles.roastQuote}>
        {'\u201C'}
        {roastText}
        {'\u201D'}
      </span>
      <div className={styles.roastMeta}>
        {verdict && (
          <span className={`${styles.verdictBadge} ${verdictClass}`}>
            {verdict.toUpperCase()}
          </span>
        )}
        {score != null && <span>{score.toFixed(1)}</span>}
        {target && <span>{target}</span>}
      </div>
    </div>
  )
}

function ExpandableBlock({ event }: { event: ActivityEvent }) {
  const [open, setOpen] = useState(false)
  if (!event.expandable) return null

  return (
    <>
      <div
        className={styles.expandTrigger}
        onClick={(e) => {
          e.stopPropagation()
          setOpen(!open)
        }}
      >
        {open ? '[-]' : '[+]'} {event.expandable.title}
      </div>
      {open && (
        <div className={styles.expandContent}>
          <div className={styles.expandInner}>{event.expandable.content}</div>
        </div>
      )}
    </>
  )
}
