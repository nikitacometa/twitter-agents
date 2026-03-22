import { useCallback, useEffect, useRef, useState } from 'react'
import type { ActivityEvent, ActivityEventType } from '@/types/activity'
import { EVENT_CONFIG } from '@/types/activity'

// --- Public types ---

export interface TypewriterLine {
  event: ActivityEvent
  displayText: string
  isComplete: boolean
  showCursor: boolean
  isStatic: boolean
}

// --- Internal types ---

type TypingAction =
  | { type: 'type'; text: string; speed: number }
  | { type: 'pause'; ms: number }
  | { type: 'delete'; count: number; speed: number }

// --- Shorter terminal labels ---

const TERMINAL_LABELS: Record<ActivityEventType, string> = {
  wake: 'ONLINE',
  sleep: 'SLEEP',
  hunt: 'HUNT',
  target_locked: 'TARGET',
  research: 'RESEARCH',
  cooking: 'COOK',
  roast_ready: 'VERDICT',
  posted: 'POST',
  engagement: 'ENGAGE',
  mention: 'MENTION',
  burn_request: 'BURN',
  challenge: 'VERSUS',
  think: 'THINK',
  stats: 'STATS',
  error: 'ERROR',
  milestone: 'MILE',
}

const LABEL_PAD = 10

// --- Helpers ---

function formatTime(ts: string): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export function getLineParts(event: ActivityEvent) {
  const config = EVENT_CONFIG[event.type]
  const timePart = `${formatTime(event.timestamp)} `
  const labelPart = `${config.icon} ${TERMINAL_LABELS[event.type].padEnd(LABEL_PAD)}`
  return { timePart, labelPart, narrative: event.narrative }
}

export function getFullLineText(event: ActivityEvent): string {
  const { timePart, labelPart, narrative } = getLineParts(event)
  return timePart + labelPart + narrative
}

function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}

/** Per-character speed with punctuation pauses */
function charDelay(ch: string, base: number): number {
  if ('.!?'.includes(ch)) return base * 3
  if (',;:'.includes(ch)) return base * 1.5
  if (ch === ' ') return base * 0.7
  return base + (Math.random() * 8 - 4)
}

// --- Action builder ---

function buildActions(event: ActivityEvent): TypingAction[] {
  const config = EVENT_CONFIG[event.type]
  const { timePart, labelPart, narrative } = getLineParts(event)

  const actions: TypingAction[] = [
    { type: 'type', text: timePart + labelPart, speed: 8 },
  ]

  const h = hash(event.id)
  const shouldBackspace = config.category === 'thinking' && (h % 10) < 2
  const shouldPause = (h % 10) < 4

  if (shouldBackspace && narrative.length > 20) {
    const words = narrative.split(' ')
    const splitAt = Math.max(2, Math.floor(words.length * 0.5))
    const first = words.slice(0, splitAt).join(' ') + ' '
    const rest = words.slice(splitAt).join(' ')

    const wrongs = ['actually n', 'wait, ', 'hmm ma', 'no, ', 'probab', 'I think '] as const
    const wrong = wrongs[h % wrongs.length] ?? wrongs[0]

    actions.push(
      { type: 'type', text: first, speed: 25 },
      { type: 'type', text: wrong, speed: 30 },
      { type: 'pause', ms: 350 + (h % 350) },
      { type: 'delete', count: wrong.length, speed: 35 },
      { type: 'pause', ms: 150 + (h % 150) },
      { type: 'type', text: rest, speed: 22 },
    )
  } else if (shouldPause && narrative.length > 30) {
    const breaks = [...narrative.matchAll(/[.!?,;]\s/g)]
    if (breaks.length > 0) {
      const brk = breaks[h % breaks.length]!
      const idx = brk.index! + brk[0].length
      actions.push(
        { type: 'type', text: narrative.slice(0, idx), speed: 24 },
        { type: 'pause', ms: 400 + (h % 500) },
        { type: 'type', text: narrative.slice(idx), speed: 22 },
      )
    } else {
      actions.push({ type: 'type', text: narrative, speed: 24 })
    }
  } else {
    const speed = config.category === 'thinking' ? 28 : config.category === 'status' ? 18 : 24
    actions.push({ type: 'type', text: narrative, speed })
  }

  return actions
}

// --- Hook ---

interface Options {
  animateCount?: number
}

export function useTypewriter(events: ActivityEvent[], opts: Options = {}) {
  const { animateCount = 7 } = opts
  const [lines, setLines] = useState<TypewriterLine[]>([])
  const [isAnimating, setIsAnimating] = useState(false)
  const cancelledRef = useRef(false)
  const skipRef = useRef(false)
  const startedRef = useRef(false)

  const skipAnimation = useCallback(() => {
    skipRef.current = true
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => { cancelledRef.current = true }
  }, [])

  // Initialize animation when events first arrive
  useEffect(() => {
    if (startedRef.current) return
    if (events.length === 0) return
    startedRef.current = true
    cancelledRef.current = false
    skipRef.current = false

    const chrono = [...events].reverse()
    const staticCount = Math.max(0, chrono.length - animateCount)
    const staticEvts = chrono.slice(0, staticCount)
    const animEvts = chrono.slice(staticCount)

    const staticLines: TypewriterLine[] = staticEvts.map(e => ({
      event: e,
      displayText: getFullLineText(e),
      isComplete: true,
      showCursor: false,
      isStatic: true,
    }))

    setLines(staticLines)

    if (animEvts.length === 0) return

    setIsAnimating(true)

    const run = async () => {
      const current = [...staticLines]

      for (let i = 0; i < animEvts.length; i++) {
        if (cancelledRef.current) return

        const evt = animEvts[i]!
        const fullText = getFullLineText(evt)
        const actions = buildActions(evt)

        // Skip: show all remaining at once
        if (skipRef.current) {
          const remaining = animEvts.slice(i).map(e => ({
            event: e,
            displayText: getFullLineText(e),
            isComplete: true,
            showCursor: false,
            isStatic: false,
          }))
          current.push(...remaining)
          setLines([...current])
          break
        }

        // Clear previous cursor
        for (let j = 0; j < current.length; j++) {
          const line = current[j]
          if (line?.showCursor) current[j] = { ...line, showCursor: false }
        }

        // Add new line
        const idx = current.length
        current.push({
          event: evt,
          displayText: '',
          isComplete: false,
          showCursor: true,
          isStatic: false,
        })
        setLines([...current])

        await sleep(150)
        if (cancelledRef.current) return

        // Process typing actions
        let text = ''
        const updateLine = (partial: Partial<TypewriterLine>) => {
          current[idx] = { ...current[idx]!, ...partial }
          setLines([...current])
        }

        for (const action of actions) {
          if (cancelledRef.current) return
          if (skipRef.current) break

          if (action.type === 'type') {
            for (const ch of action.text) {
              if (cancelledRef.current) return
              if (skipRef.current) break
              text += ch
              updateLine({ displayText: text })
              await sleep(charDelay(ch, action.speed))
            }
          } else if (action.type === 'pause') {
            if (!skipRef.current) await sleep(action.ms)
          } else if (action.type === 'delete') {
            for (let d = 0; d < action.count; d++) {
              if (cancelledRef.current) return
              if (skipRef.current) break
              text = text.slice(0, -1)
              updateLine({ displayText: text })
              await sleep(action.speed)
            }
          }
        }

        // Complete this line
        current[idx] = {
          event: evt,
          displayText: fullText,
          isComplete: true,
          showCursor: false,
          isStatic: false,
        }
        setLines([...current])

        // Pause between lines
        if (i < animEvts.length - 1 && !skipRef.current) {
          await sleep(350 + Math.random() * 500)
        }
      }

      setIsAnimating(false)
    }

    void run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length])

  return { lines, isAnimating, skipAnimation }
}
