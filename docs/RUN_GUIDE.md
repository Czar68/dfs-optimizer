# DFS-Optimizer — Run Guide

```bash
npm run dry          # run_optimizer -DryRun
npm run verify       # verify_wiring -Flow all
npm run scanner      # run_optimizer -Force
npm run nightly      # nightly_maint.ps1 -Force
npm run status       # run_selective -Mode status
npm run deploy:check # IONOS vite/.htaccess/assets guard
```

From **master_auto:** `.\scripts\auto_mode.ps1 -Mode nightly -Force -Subset "dfs-optimizer"`
