import { useCallback, useEffect, useRef, useState } from 'react'
import type { ActivityFeed } from '@/types/activity'
import { startPolling } from '@/services/activity'

interface UseActivityReturn {
  feed: ActivityFeed | null
  error: Error | null
  isLoading: boolean
  newCount: number
  clearNewCount: () => void
}

export function useActivity(): UseActivityReturn {
  const [feed, setFeed] = useState<ActivityFeed | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [newCount, setNewCount] = useState(0)
  const prevEventCountRef = useRef(0)

  const clearNewCount = useCallback(() => setNewCount(0), [])

  useEffect(() => {
    const stop = startPolling(
      (newFeed) => {
        setFeed((prev) => {
          if (prev && newFeed.events.length > prevEventCountRef.current) {
            setNewCount((c) => c + (newFeed.events.length - prevEventCountRef.current))
          }
          prevEventCountRef.current = newFeed.events.length
          return newFeed
        })
        setError(null)
        setIsLoading(false)
      },
      (err) => {
        setError(err)
        setIsLoading(false)
      },
    )

    return stop
  }, [])

  return { feed, error, isLoading, newCount, clearNewCount }
}
