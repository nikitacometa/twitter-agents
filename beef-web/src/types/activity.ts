export type ActivityEventType =
  | 'wake'
  | 'sleep'
  | 'hunt'
  | 'target_locked'
  | 'research'
  | 'cooking'
  | 'roast_ready'
  | 'posted'
  | 'engagement'
  | 'mention'
  | 'burn_request'
  | 'challenge'
  | 'think'
  | 'stats'
  | 'error'
  | 'milestone'

export interface ActivityEvent {
  id: string
  type: ActivityEventType
  timestamp: string
  narrative: string
  data?: Record<string, unknown>
  expandable?: {
    title: string
    content: string
  }
}

export interface ActivityFeed {
  version: number
  botStatus: 'online' | 'offline' | 'sleeping'
  lastUpdate: string
  stats: {
    totalRoasts: number
    totalLikes: number
    stockpileSize: number
    burnedTokens: number
    uptime: string
  }
  events: ActivityEvent[]
}

export type EventCategory = 'action' | 'thinking' | 'result' | 'status' | 'engagement'

export const EVENT_CONFIG: Record<ActivityEventType, { icon: string; category: EventCategory; label: string }> = {
  wake:          { icon: '◉', category: 'status',     label: 'ONLINE' },
  sleep:         { icon: '◎', category: 'status',     label: 'SLEEP' },
  hunt:          { icon: '◎', category: 'action',     label: 'HUNTING' },
  target_locked: { icon: '⊕', category: 'action',     label: 'TARGET LOCKED' },
  research:      { icon: '◈', category: 'thinking',   label: 'RESEARCH' },
  cooking:       { icon: '⊙', category: 'action',     label: 'COOKING' },
  roast_ready:   { icon: '✦', category: 'result',     label: 'VERDICT' },
  posted:        { icon: '◆', category: 'result',     label: 'POSTED' },
  engagement:    { icon: '◇', category: 'engagement', label: 'ENGAGEMENT' },
  mention:       { icon: '◌', category: 'action',     label: 'MENTION' },
  burn_request:  { icon: '◌', category: 'action',     label: 'BURN REQUEST' },
  challenge:     { icon: '◌', category: 'action',     label: 'CHALLENGE' },
  think:         { icon: '◐', category: 'thinking',   label: 'THINKING' },
  stats:         { icon: '▣', category: 'result',     label: 'STATS' },
  error:         { icon: '✗', category: 'status',     label: 'ERROR' },
  milestone:     { icon: '★', category: 'result',     label: 'MILESTONE' },
}
