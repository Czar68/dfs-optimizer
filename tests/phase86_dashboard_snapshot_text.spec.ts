import { buildDashboardSnapshotText } from '../web-dashboard/src/lib/dashboardSnapshotText'

describe('Phase 86 — dashboard snapshot text', () => {
  it('buildDashboardSnapshotText includes only non-empty optional lines', () => {
    const full = buildDashboardSnapshotText({
      runTimestamp: '2025-03-22T12:00:00Z',
      verdict: 'PLAYABLE',
      reason: 'Exported cards present.',
      slateLine: 'ACTIVE — next leg in 3h',
      gapPct: '-1.2%',
      topCard: 'PP · 6F Flex · EV 5.00% — legs…',
      topNearMiss: null,
      actionPrimary: 'Review top cards now',
    })
    expect(full).toContain('Run: 2025-03-22T12:00:00Z')
    expect(full).toContain('Gap: -1.2%')
    expect(full).toContain('Top Card: PP · 6F Flex')
    expect(full).not.toContain('Top Near Miss:')
    expect(full.trim().endsWith('Action: Review top cards now')).toBe(true)
  })

  it('omits Run when timestamp missing', () => {
    const t = buildDashboardSnapshotText({
      verdict: 'NOT PLAYABLE',
      reason: 'x',
      slateLine: 'y',
      actionPrimary: 'Wait',
    })
    expect(t).not.toMatch(/^Run:/m)
    expect(t).not.toContain('Gap:')
  })
})
