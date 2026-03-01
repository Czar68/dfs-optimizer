***

## 2. `DEVELOPMENT_RULES.md`

Save this at the repo root as `DEVELOPMENT_RULES.md`.

```markdown
# Development Rules (IRONCLAD)

These rules govern all work on this project. They are not suggestions.

## Core Rules

1. **Never assume anything.**  
   - If it is not explicitly requested, do not change it.  
   - No “helpful” refactors, no silent fixes, no speculative improvements.

2. **Full-file replacements only.**  
   - When changing a file, send/commit the *entire* file, not a snippet.  
   - Verify imports, exports, and line counts before committing.

3. **Git is truth.**  
   - The repo state at the last committed hash is the only source of truth.  
   - When in doubt, reset to the last known good commit.

4. **No logic changes without explicit permission.**  
   - EV math, card construction, and payouts are **locked** unless explicitly requested.  
   - Tuning knobs (constants) can only be changed when explicitly specified.

5. **Verify before sending.**  
   - TypeScript: `npx tsc -p .` must pass.  
   - Core flows: `node dist/run_optimizer.js` must run without crashing.  
   - Do not commit or accept changes until basic checks succeed.

6. **Disable, don’t delete.**  
   - Incomplete features and experiments must be guarded with flags or `// TODO:` comments.  
   - Do not delete working code unless explicitly requested and understood.

7. **Ask for confirmation on ambiguity.**  
   - If requirements are unclear, pause and ask.  
   - Do not guess about file names, types, or shapes.

8. **Report what changed.**  
   - For every change, list: file name, exact lines modified, and a short description.  
   - Keep commit messages aligned with this description.

## Session-Specific Rules

1. **Start-of-session baseline.**  
   - Always begin by confirming the current HEAD:  
     ```bash
     git log --oneline -1
     ```  
   - Treat that commit as the baseline for the session.

2. **One concern per commit.**  
   - Separate commits for:  
     - Constant/tuning changes (e.g., `MIN_EDGE_PER_LEG`).  
     - New features or flows.  
     - Bug fixes (e.g., CSV extra row, Sheets offset).  
     - Security changes (tokens, .gitignore).

3. **Emergency rollback is always allowed.**  
   - If the project drifts into a broken state, roll back immediately to the last known good commit.  
   - Then carefully reapply changes in small, verified steps.

4. **Docs stay in sync.**  
   - `CONVERSATION_BASELINE.md` must reflect the actual HEAD commit and data flow at end-of-day.  
   - `DEVELOPMENT_RULES.md` and `GIT_WORKFLOW.md` must be updated when process changes.

## Invariants (Do Not Break)

- Data flow: PrizePicks → merge with SGO → EV → filters → card builder → outputs.  
- EV calculation and payout math: only changed by explicit, isolated request.  
- File responsibilities:  
  - `merge_odds.ts`: SGO merge only.  
  - `calculate_ev.ts`: edge/trueProb only.  
  - `payouts.ts`: payout structures only.  
  - `card_ev.ts`: card EV and distributions only.

## Collaboration Rules

- Every conversation must end with:
  - Updated baseline in `CONVERSATION_BASELINE.md`.  
  - Confirmation of HEAD commit.  
  - Clear list of next actions.

- New conversations must start by:
  - Reading the current `CONVERSATION_BASELINE.md`.  
  - Confirming HEAD via `git log --oneline -1`.  
  - Re-stating the current status and next actions.
