type Props = {
  theme: 'light' | 'dark'
  onThemeToggle: () => void
  navOpen: boolean
  onNavToggle: () => void
  onNavLinkClick: () => void
}

export default function SlipStrengthSiteHeader({
  theme,
  onThemeToggle,
  navOpen,
  onNavToggle,
  onNavLinkClick,
}: Props) {
  return (
    <header className="site-header">
      <div className="container site-header-inner">
        <a href="#top" className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="3.5" y="5" width="17" height="14" rx="4" stroke="currentColor" strokeWidth="1.6" opacity="0.9" />
              <path
                d="M7 14.5 10 11l2.2 2.4L16.5 9"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span className="brand-text">
            <span>Pick&apos;em tools</span>
            <strong>SlipStrength</strong>
          </span>
        </a>

        <nav className="nav" aria-label="Primary" data-open={navOpen ? 'true' : undefined}>
          <button className="mobile-nav-toggle" type="button" aria-label="Toggle navigation" onClick={onNavToggle}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <div className="nav-links" data-nav-links onClick={onNavLinkClick}>
            <a href="#optimizer" aria-current="page">
              Optimizer
            </a>
            <a href="#why-these-picks">Why these picks</a>
            <a href="#stats-history">Stats &amp; history</a>
            <a href="#automations">Automations</a>
          </div>
        </nav>

        <div className="nav-actions">
          <button
            className="theme-toggle"
            type="button"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={onThemeToggle}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </button>
          <a href="#optimizer" className="btn btn-ghost">
            Launch optimizer
          </a>
        </div>
      </div>
    </header>
  )
}
