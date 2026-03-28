import { useCallback, useEffect, useState } from 'react'
import SlipStrengthSiteHeader from './SlipStrengthSiteHeader'
import SlipStrengthHero from './SlipStrengthHero'
import { SlipStrengthOptimizerDataProvider } from './SlipStrengthOptimizerDataContext'
import SlipStrengthOptimizerSection from './SlipStrengthOptimizerSection'
import SlipStrengthWhySection from './SlipStrengthWhySection'
import SlipStrengthStatsHistorySection from './SlipStrengthStatsHistorySection'
import SlipStrengthAutomationsSection from './SlipStrengthAutomationsSection'
import SlipStrengthFooter from './SlipStrengthFooter'

/**
 * SlipStrength landing + optimizer shell (ported from parlay-optimizer (1).html).
 * Theme + mobile nav mirror the vanilla script behavior.
 */
export default function SlipStrengthApp() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light'
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  const onThemeToggle = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  const onNavToggle = useCallback(() => {
    setNavOpen((o) => !o)
  }, [])

  const onNavLinkClick = useCallback(() => {
    setNavOpen(false)
  }, [])

  return (
    <>
      <a href="#optimizer" className="skip-link">
        Skip to optimizer
      </a>

      <SlipStrengthSiteHeader
        theme={theme}
        onThemeToggle={onThemeToggle}
        navOpen={navOpen}
        onNavToggle={onNavToggle}
        onNavLinkClick={onNavLinkClick}
      />

      <main id="top">
        <SlipStrengthOptimizerDataProvider>
          <SlipStrengthHero />
          <SlipStrengthOptimizerSection />
          <SlipStrengthWhySection />
          <SlipStrengthStatsHistorySection />
        </SlipStrengthOptimizerDataProvider>
        <SlipStrengthAutomationsSection />
      </main>

      <SlipStrengthFooter />
    </>
  )
}
