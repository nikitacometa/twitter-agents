import type { ActivityFeed } from '@/types/activity'
import styles from './StatusBar.module.css'

interface Props {
  feed: ActivityFeed | null
  isLoading: boolean
}

export function StatusBar({ feed, isLoading }: Props) {
  const status = feed?.botStatus ?? 'offline'
  const isOnline = status === 'online'

  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        <a href="https://0xbeef.wtf" className={styles.brand}>
          $BEEF
        </a>
        <span className={styles.version}>v2.0</span>
        <span className={styles.separator}>·</span>
        <span className={`${styles.status} ${isOnline ? styles.online : styles.offline}`}>
          <span className={styles.dot} />
          {isLoading ? 'connecting...' : status}
        </span>
      </div>
      <div className={styles.right}>
        {feed && (
          <>
            <span className={styles.stat}>
              <span className={styles.statValue}>{feed.stats.totalRoasts}</span> roasts
            </span>
            <span className={styles.separator}>·</span>
            <span className={styles.stat}>
              <span className={styles.statValue}>{feed.stats.totalLikes.toLocaleString()}</span> likes
            </span>
            <span className={styles.separator}>·</span>
            <span className={styles.stat}>
              up {feed.stats.uptime}
            </span>
          </>
        )}
      </div>
    </header>
  )
}
