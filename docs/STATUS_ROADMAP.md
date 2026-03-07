# DFS Dashboard — Status & Roadmap

**Last updated:** 2026-03-06 (post Phase 4, IONOS live)

---

## Status Table

| Phase | Status   | Key Metrics | Next |
|-------|----------|--------------|------|
| **1–3** | **Live** | Alignment 100%, deeplinks (UD ?legs=, PP board + player slugs), Copy Parlay fallback, console validation logs | — |
| **4**   | **Done** | Verify + fresh run: PP 491 / 143 legs, UD 800 / 14 legs. Expand toggle, load status line, mobile truncate, Refresh Data button | Deploy to IONOS |
| **5**   | Next     | Real-time API / live data | WebSocket or polling |
| **6+**  | Backlog  | Calibration (76 tests), NHL expand | — |

---

## Phase 4 Deliverables (Done)

1. **Verify + fresh**
   - Fresh pipeline run completed: **PP 491 cards, 143 legs | UD 800 cards, 14 legs**
   - Console: `[Dashboard] Live data validation: { PP: { source, cards, legs }, UD: { ... } }`
   - Results DB: 1291 cards exported (run 20260306-172015)

2. **Code**
   - **App.tsx:** Expand toggle button (▼/▲) per row; load status "Last fresh: … | PP:491 UD:800"; Refresh Data button (copies IONOS instructions).
   - **index.css:** Mobile player col flex-truncate (≤1024px and ≤640px).

3. **Build**
   - `npm run build` → `dist/assets/index-y4n8kjTP.js`, `index-DciHqGtf.css`
   - Checklist: `docs/IONOS_DEPLOY_CHECKLIST.md`

4. **Tests (manual)**
   - **Alignment:** Scroll table → data under headers; player names clamp (no overflow).
   - **Deeplinks:** Player chip → UD/PP profile; UD "Pick'em" → full-slip URL with `?legs=`.
   - **Copy:** "Copy Parlay" → clipboard "Jalen Brunson PTS o28.5, ..." + "Copied parlay!" toast.
   - **Expand:** ▼ opens row with 3 options: 1) Open full slip, 2) Player profile links, 3) Copy Parlay.
   - **Portfolio post-fresh:** Top 30 stake within $36–$72 (≤12% of $600).

---

## FileZilla Steps (summary)

1. Open FileZilla → connect to IONOS.
2. Local: `web-dashboard/dist/`; Remote: `htdocs/dfs/`.
3. Upload all files from `dist/` into `dfs/` (overwrite).
4. Confirm `dfs/data/` has 4 CSVs + `last_fresh_run.json`, `dfs/assets/` has new JS/CSS.

---

## IONOS Path Reference

- **Document root for /dfs:** `/kunden/homepages/14/d4299584407/htdocs/dfs/`
- **URL:** `https://<your-domain>/dfs/` or `/dfs/index.html`
- **Cron:** Use `cron-generate.py` (or equivalent) for scheduled data refresh; then re-upload `data/` (and optionally full `dist/`).
