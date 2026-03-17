/**
 * Breakeven panel: reference grid from verify:breakeven (artifacts/parlay_breakeven_table.md).
 * UD 2P STD BE 53.45%, PP 6F BE 54.21%. Run npm run verify:breakeven to refresh.
 */

const STANDARD_ROWS = [
  { legs: 2, payout: '3x', be: 57.74, structure: 'PP 2P', highlight: false },
  { legs: 2, payout: '3.5x', be: 53.45, structure: 'UD 2P STD', highlight: true },
  { legs: 3, payout: '6x', be: 54.99, structure: 'PP 3P', highlight: false },
  { legs: 3, payout: '6.5x', be: 53.58, structure: 'UD 3P STD', highlight: false },
  { legs: 4, payout: '10x', be: 56.23, structure: 'UD 4P STD', highlight: false },
  { legs: 5, payout: '20x', be: 54.93, structure: 'UD 5P STD', highlight: false },
  { legs: 6, payout: '35x', be: 55.29, structure: 'UD 6P STD', highlight: false },
  { legs: 7, payout: '65x', be: 55.08, structure: 'UD 7P STD', highlight: false },
  { legs: 8, payout: '120x', be: 54.97, structure: 'UD 8P STD', highlight: false },
]

const FLEX_ROWS = [
  { legs: 3, payout: '3:3, 2:1', be: 57.74, structure: 'PP 3F', highlight: false },
  { legs: 4, payout: '4:6, 3:1.5', be: 55.03, structure: 'PP 4F', highlight: false },
  { legs: 5, payout: '5:10, 4:2, 3:0.4', be: 54.25, structure: 'PP 5F', highlight: false },
  { legs: 6, payout: '6:25, 5:2, 4:0.4', be: 54.21, structure: 'PP 6F', highlight: true },
  { legs: 3, payout: '3:3.25, 2:1.09', be: 55.39, structure: 'UD 3F FLX', highlight: false },
  { legs: 4, payout: '4:6, 3:1.5', be: 55.03, structure: 'UD 4F FLX', highlight: false },
  { legs: 5, payout: '5:10, 4:2.5', be: 54.75, structure: 'UD 5F FLX', highlight: false },
  { legs: 6, payout: '6:25, 5:2.6', be: 54.54, structure: 'UD 6F FLX', highlight: false },
]

export default function BreakevenPanel() {
  const updatedNote = 'Updated from artifacts/parlay_breakeven_table.md. Run npm run verify:breakeven to refresh.'

  return (
    <div className="p-4 font-mono flex flex-col gap-6">
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
        Reference breakeven p* (binomial-derived). Per .cursor rules: never hardcode BE % — derive from
        payoutByHits via solveBreakevenProbability.
      </div>

      <div className="border border-[var(--border)] rounded overflow-hidden" style={{ background: 'var(--bg-surface)' }}>
        <div className="px-3 py-2 border-b border-[var(--border)] text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
          TABLE: Standard parlays
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th className="px-3 py-2 text-left" style={{ color: 'var(--text-muted)' }}>Legs</th>
              <th className="px-3 py-2 text-left" style={{ color: 'var(--text-muted)' }}>Payout</th>
              <th className="px-3 py-2 text-left" style={{ color: 'var(--text-muted)' }}>Breakeven %</th>
              <th className="px-3 py-2 text-left" style={{ color: 'var(--text-muted)' }}>Structure</th>
            </tr>
          </thead>
          <tbody>
            {STANDARD_ROWS.map((row, i) => (
              <tr
                key={`std-${i}`}
                style={{
                  borderBottom: '1px solid var(--border)',
                  borderLeft: row.highlight ? '3px solid var(--accent)' : undefined,
                  background: row.highlight ? 'var(--bg-elevated)' : undefined,
                }}
              >
                <td className="px-3 py-2">{row.legs}</td>
                <td className="px-3 py-2">{row.payout}</td>
                <td className="px-3 py-2">{row.be.toFixed(2)}%</td>
                <td className="px-3 py-2">{row.structure}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border border-[var(--border)] rounded overflow-hidden" style={{ background: 'var(--bg-surface)' }}>
        <div className="px-3 py-2 border-b border-[var(--border)] text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
          TABLE: Power play / Flex
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th className="px-3 py-2 text-left" style={{ color: 'var(--text-muted)' }}>Legs</th>
              <th className="px-3 py-2 text-left" style={{ color: 'var(--text-muted)' }}>Payout schedule</th>
              <th className="px-3 py-2 text-left" style={{ color: 'var(--text-muted)' }}>Breakeven %</th>
              <th className="px-3 py-2 text-left" style={{ color: 'var(--text-muted)' }}>Structure</th>
            </tr>
          </thead>
          <tbody>
            {FLEX_ROWS.map((row, i) => (
              <tr
                key={`flex-${i}`}
                style={{
                  borderBottom: '1px solid var(--border)',
                  borderLeft: row.highlight ? '3px solid var(--accent)' : undefined,
                  background: row.highlight ? 'var(--bg-elevated)' : undefined,
                }}
              >
                <td className="px-3 py-2">{row.legs}</td>
                <td className="px-3 py-2">{row.payout}</td>
                <td className="px-3 py-2">{row.be.toFixed(2)}%</td>
                <td className="px-3 py-2">{row.structure}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
        {updatedNote}
      </div>
    </div>
  )
}
