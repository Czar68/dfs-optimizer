import { useEffect, useState } from 'react'
import SlipStrengthApp from './slipstrength/SlipStrengthApp'
import DfsProDashboardApp from './legacy/DfsProDashboardApp'

/** Query `view` values that must mount the legacy DFS PRO app (data, canonical samples, admin tools). */
const LEGACY_VIEW_KEYS = new Set(['dfs-pro', 'canonical-samples', 'admin'])

function legacyViewActive(): boolean {
  if (typeof window === 'undefined') return false
  const v = new URLSearchParams(window.location.search).get('view')
  return v != null && v !== '' && LEGACY_VIEW_KEYS.has(v)
}

/**
 * Default UX: SlipStrength shell (parlay-optimizer HTML port).
 * Legacy operational dashboard: `?view=dfs-pro` (or `canonical-samples` / `admin` where those flows apply).
 */
export default function App() {
  const [legacyDashboard, setLegacyDashboard] = useState(legacyViewActive)

  useEffect(() => {
    const sync = () => setLegacyDashboard(legacyViewActive())
    sync()
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  if (legacyDashboard) {
    return <DfsProDashboardApp />
  }
  return <SlipStrengthApp />
}
