/**
 * Stub for wiring live optimizer data (CSV, reports, API) into the SlipStrength shell.
 * Replace this region with real hooks/components when integrating — no math/pipeline changes here.
 */
declare const __APP_BASE__: string | undefined

export function getDataBaseForWiring(): string {
  return `${(typeof __APP_BASE__ !== 'undefined' ? __APP_BASE__ : '/').replace(/\/+$/, '')}/data`
}

export default function LiveDataAdapterPlaceholder() {
  const base = getDataBaseForWiring()
  return (
    <p className="hint" style={{ marginTop: 'var(--space-3)' }}>
      <strong>Live data wiring:</strong> fetch props from <code>{base}</code> and mount your table/cards inside{' '}
      <code>#slipstrength-root</code> (see Optimizer section). This placeholder is front-end only.
    </p>
  )
}
