const MINUTE = 60
const HOUR = 3600
const DAY = 86400

export function relativeTime(timestamp: string): string {
  const seconds = Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000)

  if (seconds < 0) return 'just now'
  if (seconds < 60) return 'just now'
  if (seconds < HOUR) {
    const m = Math.floor(seconds / MINUTE)
    return `${m}m ago`
  }
  if (seconds < DAY) {
    const h = Math.floor(seconds / HOUR)
    return `${h}h ago`
  }
  const d = Math.floor(seconds / DAY)
  return `${d}d ago`
}

export function absoluteTime(timestamp: string): string {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}
