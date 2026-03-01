# Test: NBA overflow fixed, ready for backlog[0]

**FIXED:** NBA overflow — combinatorial ceiling in `src/config/underdog_structures.ts` is capped at 1e6 (`Math.min(..., 1000000)`) in `getUnderdogMaxAttemptsForStructure`. Safe upper bound and integer coercion in place.

**Artifacts contract:** `artifacts/last_run.json` present (dry_run_ok). Human report: `artifacts/nba_optimizer_*.md`.

**NOT VERIFIED** (could not run in this environment):
1. `npm test` (Jest)
2. `scripts/verify_wiring.ps1`
3. `scripts/run_optimizer.ps1` (full run)

**Ready for backlog[0]:** When `projects.json` exists with `backlog`, next work = first backlog item. Nightly flow: `docs/prompts/nightly_improvement.md` (overflow-safe, &lt;4k chars).
