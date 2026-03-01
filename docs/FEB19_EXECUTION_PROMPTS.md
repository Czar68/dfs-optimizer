# Feb 19 NBA Execution Prompts — Copy-Paste Ready

Use these prompts **in order** in Cursor chat (nba-props-optimizer workspace). Each prompt builds on the previous one.

---

## Prompt 1 – Verify and lock in build/run commands

```
You are working in the nba-props-optimizer repo.

1) Inspect package.json and the dist/ folder and tell me the exact commands to:
   - Compile the TypeScript project.
   - Run the main optimizer that generates PrizePicks NBA legs/cards CSVs for today's slate.
   - Run an NBA-only variant if one exists (e.g. run_nba_optimizer).

2) Respond with a numbered list of concrete commands I should run from the project root in PowerShell.
Do NOT run anything yourself; just show the commands.
```

---

## Prompt 2 – Run full NBA-only optimizer pass

```
Now run a full NBA-only production pass for tonight's slate (Feb 19, 2026):

1) From the project root, run the compile + optimizer commands you identified, but ensure that the outputs (legs/cards CSVs) only include NBA for today's games.

2) After the run, inspect the generated CSVs and confirm:
   - Total NBA legs count.
   - Total NBA cards count.
   - Names of 3–5 sample games from today's slate present in the data.

3) Report back with those three numbers plus a brief summary (1–2 lines). Make no code changes.
```

---

## Prompt 3 – Push latest NBA run to Sheets

```
Using the existing Google Sheets SA auth and sheets_test.py wiring, do the following:

1) Identify which script or function is responsible for pushing the latest legs/cards into Google Sheets.

2) Run the appropriate command(s) so that today's NBA-only legs/cards from the last optimizer run are written into the production sheet.

3) Confirm:
   - Sheet ID used.
   - Tab(s) or range(s) updated.
   - Number of rows written for NBA legs and for NBA cards.

Do not modify any code; only run the existing tooling.
```

---

## Prompt 4 – Rebuild dashboard for tonight's data

```
Rebuild the React/Vite dashboard with the latest NBA-only data from the last optimizer run:

1) From web-dashboard/, run whatever build command is configured (likely npm run build) to regenerate dist/ using the current CSVs.

2) Confirm that the resulting dist/ directory contains:
   - index.html
   - assets/ bundle
   - data/ with the updated NBA legs/cards CSVs (or whatever data files the dashboard reads).

3) Summarize the result: which files in dist/data/ correspond to tonight's NBA run and their row counts.

Do not change code; only run the build.
```

---

## Prompt 5 – Deploy checklist for me

```
Generate a concise deployment checklist for ME (the human) to complete a production deploy for tonight's NBA-only run:

1) Assume web-dashboard/dist/ is freshly built with today's NBA data.
2) Assume Netlify site is dynamic-gingersnap-3ee837 and GOOGLE_APPLICATION_CREDENTIALS is already set.

Output:
- Exact human steps to drag-and-drop dist/ to Netlify.
- The URL I should visit to verify the dashboard.
- One simple way to sanity-check that the slate shown matches tonight's NBA games.

No code or commands—just a human-facing checklist.
```

---

## Expected Flow

1. **Prompt 1** → Commands identified (likely: `npx tsc`, `npm start` or `ts-node src/run_optimizer.ts --sports NBA`)
2. **Prompt 2** → NBA CSVs generated → counts + sample games reported
3. **Prompt 3** → `python sheets_push_legs.py` + `python sheets_push_cards.py` → Sheet updated
4. **Prompt 4** → `cd web-dashboard && npm run build` → `dist/` regenerated
5. **Prompt 5** → Human checklist → drag `dist/` to Netlify → verify live

---

## Notes

- Run prompts **sequentially** in the same Cursor chat (or separate chats if preferred).
- Each prompt assumes the previous step completed successfully.
- No code changes requested—only execution and reporting.
- Final deploy is manual (drag-drop to Netlify).
