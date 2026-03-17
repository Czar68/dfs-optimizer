You are assisting with the automation of a professional sports betting optimizer.

The system already includes:

- DP EV engine
- Kelly staking
- correlation matrix
- CLV tracking
- true probability ML model
- card optimizer for PrizePicks and Underdog
- composite scoring system

Your task is to design a fully automated daily pipeline.

The pipeline must:

1. Scrape props from PrizePicks and Underdog
2. Record historical props into nba_props_master.csv
3. Track line movement into line_movement.csv
4. Update prop_clv_dataset.csv after results are known
5. Rebuild prop_correlation_matrix.csv daily
6. Retrain true_prob_model.json daily
7. Generate CLV calibration curve
8. Run both optimizers:
   - run_optimizer.ts
   - run_underdog_optimizer.ts
9. Export cards CSV files
10. Trigger dashboard refresh
11. Send best bets to Telegram

The system runs in Node.js with TypeScript.

Produce:

1. Complete automation architecture
2. Cron schedule
3. Folder structure
4. Failure handling
5. Logging and monitoring
6. Example automation scripts