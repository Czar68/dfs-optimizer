export default function SlipStrengthFooter() {
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div>
          <div style={{ fontWeight: 500 }}>SlipStrength · Pick&apos;em Parlay Optimizer</div>
          <div>
            &copy; {new Date().getFullYear()}. Not affiliated with PrizePicks, Underdog, Betr or Pick6; for informational
            use only.
          </div>
        </div>
        <div className="footer-links">
          <a href="#optimizer">Optimizer</a>
          <a href="#why-these-picks">Why these picks</a>
          <a href="#stats-history">Stats &amp; history</a>
          <a href="#automations">Automations</a>
        </div>
      </div>
    </footer>
  )
}
