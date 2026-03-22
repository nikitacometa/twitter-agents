import { useMemo } from 'react'
import type { ActivityFeed } from '@/types/activity'
import styles from './Sidebar.module.css'

interface Props {
  feed: ActivityFeed | null
}

export function Sidebar({ feed }: Props) {
  const targetsCount = useMemo(() => {
    if (!feed) return 0
    const targets = feed.events
      .map(e => e.data?.['target'] as string | undefined)
      .filter((t): t is string => t != null)
    return new Set(targets).size
  }, [feed])

  return (
    <aside className={styles.sidebar}>
      <nav className={styles.nav}>
        <a href="#feed" className={`${styles.navItem} ${styles.active}`}>
          <span className={styles.navIcon}>◆</span> Feed
        </a>
        <span className={`${styles.navItem} ${styles.disabled}`}>
          <span className={styles.navIcon}>◇</span> Archive
          <span className={styles.badge}>soon</span>
        </span>
        <span className={`${styles.navItem} ${styles.disabled}`}>
          <span className={styles.navIcon}>◈</span> Stats
          <span className={styles.badge}>soon</span>
        </span>
        <span className={`${styles.navItem} ${styles.disabled}`}>
          <span className={styles.navIcon}>◌</span> Burn
          <span className={styles.badge}>soon</span>
        </span>
      </nav>

      <div className={styles.divider} />

      <div className={styles.section}>
        <div className={styles.sectionTitle}>Quick Stats</div>
        {feed ? (
          <div className={styles.statsGrid}>
            <div className={styles.statItem}>
              <div className={styles.statNumber}>{feed.stats.totalRoasts}</div>
              <div className={styles.statLabel}>roasts</div>
            </div>
            <div className={styles.statItem}>
              <div className={styles.statNumber}>{feed.stats.totalLikes.toLocaleString()}</div>
              <div className={styles.statLabel}>likes</div>
            </div>
            <div className={styles.statItem}>
              <div className={styles.statNumber}>{targetsCount}</div>
              <div className={styles.statLabel}>targets</div>
            </div>
            <div className={styles.statItem}>
              <div className={styles.statNumber}>{feed.stats.uptime}</div>
              <div className={styles.statLabel}>uptime</div>
            </div>
          </div>
        ) : (
          <div className={styles.statLabel}>loading...</div>
        )}
      </div>

      <div className={styles.divider} />

      <div className={styles.section}>
        <button className={styles.walletBtn} disabled>
          Connect Wallet
          <span className={styles.badge}>phase 2</span>
        </button>
      </div>

      <div className={styles.footer}>
        <a href="https://x.com/0xBeefer" target="_blank" rel="noopener noreferrer">
          @0xBeefer
        </a>
        <span className={styles.footerSep}>·</span>
        <a href="https://0xbeef.wtf" target="_blank" rel="noopener noreferrer">
          0xbeef.wtf
        </a>
      </div>
    </aside>
  )
}
