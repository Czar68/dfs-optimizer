3. GIT_WORKFLOW.md
Save this at the repo root as GIT_WORKFLOW.md.

text
# Git Workflow

This file defines how changes are made, verified, and recorded. Git history is the single source of truth.

## Start of New Conversation

1. Confirm current commit:
   ```bash
   git log --oneline -1
Treat this commit as the baseline for the entire conversation.

Review CONVERSATION_BASELINE.md for:

Current status

Known issues

Next prioritized actions

Normal Development Loop
For each discrete change:

Sync & inspect (optional if local-only):

bash
git status
git log --oneline -3
Edit files.

Make changes in the relevant file(s), full-file replacements only.

Run checks.

TypeScript compile:

bash
npx tsc -p .
Core run (example):

bash
node dist/run_optimizer.js
Stage changes.

bash
git add <files>
Commit with clear message.

bash
git commit -m "<type>: <summary>"
Examples:

chore: lower edge floor in run_optimizer

fix: add await to mergeOddsWithProps in underdog optimizer

security: remove token.json and ignore it

Confirm commit.

bash
git log --oneline -1
Update baseline docs.

Update CONVERSATION_BASELINE.md to reflect:

New HEAD commit hash.

Latest compile/run stats.

New/closed issues.

If workflow/process changed, update DEVELOPMENT_RULES.md or GIT_WORKFLOW.md.

End of Conversation Protocol (Standing Order)
At the end of every working session:

Ensure code compiles and core flows run:

bash
npx tsc -p .
node dist/run_optimizer.js
Update CONVERSATION_BASELINE.md:

Set Current Commit to latest HEAD hash.

Update Status.

Refresh counts (props, merged picks, legs, cards).

Refresh Known Issues and Next Actions.

Stage and commit documentation:

bash
git add CONVERSATION_BASELINE.md DEVELOPMENT_RULES.md GIT_WORKFLOW.md
git commit -m "docs: update baseline and dev rules"
git log --oneline -1
Treat this commit as the starting point for the next conversation.

Emergency Rollback
If the project enters a broken state (many errors, unclear changes):

Identify last known good commit (e.g., d249dab).

Hard reset:

bash
git reset --hard <good_commit_hash>
Rebuild and test:

bash
npx tsc -p .
node dist/run_optimizer.js
Update CONVERSATION_BASELINE.md to reflect rollback and new status.

Commit the updated baseline:

bash
git add CONVERSATION_BASELINE.md
git commit -m "docs: record rollback to <good_commit_hash>"
git log --oneline -1
Commit Granularity
Prefer small, focused commits over large ones.

One logical change per commit:

Constant/tuning adjustments.

Bug fixes.

New feature or refactor.

Security and configuration changes.

This makes it easy to bisect and understand history.

text

***

## 4. How to save these properly to git (step‑by‑step)

From the repo root:

1. Create the files:

   - Open VS Code or editor.
   - Create:
     - `CONVERSATION_BASELINE.md`
     - `DEVELOPMENT_RULES.md`
     - `GIT_WORKFLOW.md`
   - Paste the respective content above into each file and save.

2. Stage and commit:

   ```bash
   git add CONVERSATION_BASELINE.md DEVELOPMENT_RULES.md GIT_WORKFLOW.md
   git commit -m "docs: add ironclad baseline and workflow rules"
   git log --oneline -1
Paste that last git log --oneline -1 line at the start of the next conversation so we both know the anchor commit.

5. Standing order we’ll follow going forward
You want this behavior every time, so here’s the protocol I’ll treat as a standing order:

Start of every conversation:

You paste:

bash
git log --oneline -1
I restate:

Current commit hash and message.

The key bits from CONVERSATION_BASELINE.md (status, counts, next actions).

During the conversation:

One concern per commit (e.g., change constants, fix a bug, tweak Sheets script).

I always describe:

Exactly which file(s) to edit.

That it’s a full-file replacement.

The git commands to stage and commit.

End of every conversation:

We make sure:

Code compiles and runs.

CONVERSATION_BASELINE.md is updated with fresh numbers and issues.

You run:

bash
git add CONVERSATION_BASELINE.md DEVELOPMENT_RULES.md GIT_WORKFLOW.md
git commit -m "docs: update baseline and dev rules"
git log --oneline -1
You paste that line; I echo it back as the new “Conversation Baseline – <date>”.

6. Extra safeguards to eliminate mistakes
A few additional guardrails that fit your workflow and minimize future screwups:

Never touch “locked” files without you asking.
I will treat merge_odds.ts, calculate_ev.ts, payouts.ts, and card_ev.ts as immutable unless you explicitly say “we are changing X behavior in Y file.”

Explicit change tickets.
For anything non-trivial, we phrase a micro‑ticket before code, e.g.
“Ticket: Lower MIN_EDGE_PER_LEG to 0.015 in PrizePicks and Underdog optimizers, nothing else.”

No parallel multi‑file edits without a plan.
If more than one file changes, I’ll outline the sequence first (File A, test, commit; then File B, test, commit).

Docs as spec.
If we change the pipeline or behavior, we update the Markdown spec the same day (the three files above become the spec for this app).

