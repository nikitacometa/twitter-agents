import { useActivity } from '@/hooks/useActivity'
import { StatusBar } from '@/components/StatusBar'
import { Sidebar } from '@/components/Sidebar'
import { Terminal } from '@/components/Terminal'
import { MobileTabBar } from '@/components/MobileTabBar'
import styles from './App.module.css'

const EMPTY_EVENTS: import('@/types/activity').ActivityEvent[] = []

export function App() {
  const { feed, isLoading } = useActivity()

  return (
    <div className={styles.app}>
      <StatusBar feed={feed} isLoading={isLoading} />
      <div className={styles.main}>
        <Sidebar feed={feed} />
        <Terminal
          events={feed?.events ?? EMPTY_EVENTS}
          isLoading={isLoading}
        />
      </div>
      <MobileTabBar />
    </div>
  )
}
