import type { ActivityFeed } from '@/types/activity'
import sampleFeed from '@/data/sample-feed.json'

const FEED_URL = import.meta.env.VITE_FEED_URL as string | undefined
const POLL_INTERVAL = 5 * 60 * 1000 // 5 minutes

export async function fetchFeed(): Promise<ActivityFeed> {
  if (!FEED_URL) {
    return sampleFeed as ActivityFeed
  }

  const res = await fetch(FEED_URL, { cache: 'no-cache' })
  if (!res.ok) throw new Error(`Feed fetch failed: ${res.status}`)
  return res.json() as Promise<ActivityFeed>
}

export function startPolling(
  onUpdate: (feed: ActivityFeed) => void,
  onError: (err: Error) => void,
): () => void {
  let timer: ReturnType<typeof setInterval> | null = null

  const poll = async () => {
    try {
      const feed = await fetchFeed()
      onUpdate(feed)
    } catch (err) {
      onError(err instanceof Error ? err : new Error(String(err)))
    }
  }

  void poll()
  timer = setInterval(() => void poll(), POLL_INTERVAL)

  return () => {
    if (timer) clearInterval(timer)
  }
}
