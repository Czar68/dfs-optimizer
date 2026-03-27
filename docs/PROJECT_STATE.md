# Project state (compatibility index)

**Superseded split (2026-03-23):** Day-to-day context lives in **`docs/CURRENT_STATE.md`**. The long phase log moved to **`docs/PHASE_HISTORY.md`** (append-only).

| Doc | Role |
|-----|------|
| **`docs/CURRENT_STATE.md`** | Read-first SSOT — what matters now |
| **`docs/ARCHITECTURE_GUARDRAILS.md`** | Stable boundaries and invariants |
| **`docs/OPERATIONS_RUNBOOK.md`** | Run, sync, verify, publish, deploy |
| **`docs/FEATURE_ROADMAP.md`** | Feature / expansion backlog |
| **`docs/PHASE_HISTORY.md`** | Phase-by-phase archive (not default context) |

**Validation / provenance (Phase 113):** Operator commands and policies → **`docs/VALIDATION_PROVENANCE_RUNBOOK.md`**.

**Cursor / agents:** After tasks that change code or pipeline behavior, update **`docs/CURRENT_STATE.md`** (compact) and append a short entry to **`docs/PHASE_HISTORY.md`** when the work was phase-logged before; do not grow this stub.
