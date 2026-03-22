import styles from './MobileTabBar.module.css'

export function MobileTabBar() {
  return (
    <nav className={styles.tabBar}>
      <button className={`${styles.tab} ${styles.active}`}>
        <span className={styles.tabIcon}>◆</span>
        Feed
      </button>
      <button className={`${styles.tab} ${styles.disabled}`}>
        <span className={styles.tabIcon}>◇</span>
        Archive
      </button>
      <button className={`${styles.tab} ${styles.disabled}`}>
        <span className={styles.tabIcon}>◌</span>
        Burn
      </button>
      <button className={`${styles.tab} ${styles.disabled}`}>
        <span className={styles.tabIcon}>◈</span>
        Stats
      </button>
    </nav>
  )
}
