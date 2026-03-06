# DFS-OPTIMIZER — Automation Spec (Template #5)

**Project:** dfs-optimizer (Kelly dashboard + cron → sheets, IONOS deploy guard)  
**Order in master plan:** 5 of 5  
**Repo:** dfs-optimizer

---

## 1. Repo structure (unified template)

```
├── package.json          # npm run pipeline
├── scripts/              # PowerShell + Node/TS
│   ├── run_optimizer.ps1
│   ├── nightly_maint.ps1
│   ├── verify_wiring.ps1
│   ├── ionos_deploy_check.ps1   # IONOS .htaccess/assets guard
│   └── run_selective.ps1
├── data/                  # CSV/JSON
├── artifacts/             # reports + QA
├── dist/                  # Vite build output (for IONOS)
├── tests/                 # CI + cloud agent
├── config/                # .env.example
└── docs/                  # README + RUN_GUIDE + this spec
```

---

## 2. Pipeline stages

| Stage | Script / command | Output contract |
|-------|------------------|-----------------|
| Dry run | `scripts/run_optimizer.ps1 -DryRun` | `artifacts/last_run.json` |
| Verify | `scripts/verify_wiring.ps1 -Flow all` | Exit 0 + asserts |
| Scanner/main | `scripts/run_optimizer.ps1 -Force` | Kelly run |
| Nightly | `scripts/nightly_maint.ps1 -Force` | chat_prompt.md, exit 0 |
| **Deploy check** | `scripts/ionos_deploy_check.ps1` | Vite build + index.html, .htaccess, assets no 404 |

**IONOS deploy guard:** Run `npm run deploy:check` (or `scripts/ionos_deploy_check.ps1`) before push. Validates vite build, index.html, .htaccess, and that assets do not 404.

---

## 3. Cloud + local

- **Cloud:** Cursor Automations (PR, healthchecks). IONOS deploy guard agent can run `npm run deploy:check` on PR.
- **Local:** master_auto → auto_mode.ps1; window 10p–1:30a + 7a/noon/6p Mon–Fri. Cron → sheets as configured.

---

## 4. npm run pipeline

| Command | Purpose |
|---------|--------|
| `npm run dry` | run_optimizer -DryRun |
| `npm run verify` | verify_wiring -Flow all |
| `npm run scanner` | run_optimizer -Force |
| `npm run nightly` | nightly_maint.ps1 -Force |
| `npm run status` | run_selective -Mode status |
| `npm run deploy:check` | ionos_deploy_check.ps1 (vite build + path/assets guard) |
| `npm run test` | verify_wiring -DryRun |

---

## 5. Master runner

From **master_auto:** `.\scripts\auto_mode.ps1 -Mode nightly -Force -Subset "dfs-optimizer"`  
From this repo: `.\scripts\run_selective.ps1 -Mode full -Force` (all except this project).
