# Nightly improvement (overflow-safe)

WORK ONLY ON backlog from projects.json. IGNORE all other items.

## RULES

1. **1 FILE MAXIMUM** per run.
2. Check context usage before edits. If >80%, STOP and append "Next: [file/path]" to backlog.
3. End with: **FIXED: [description]** + git commit message.
4. Output ONLY code changes + `git add` / `git commit` commands.

**backlog:** [will be injected]

---

- Test: Ensure this prompt <4k chars.
- After run: write `artifacts/cursor_agent_output.md` with FIXED + 1 file only.
