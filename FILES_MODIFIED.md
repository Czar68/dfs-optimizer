# FILES_MODIFIED

## Recent Changes

### 14. **src/cli_args.ts (2026-03-27):** Added Phase 17X CLI singleton
- **CLI Singleton Functions:**
  - `resolveCliArgsFromProcessArgv()` - Parses process.argv and returns a CliArgs object without setting the singleton
  - `setCliArgsForProcess(args)` - Stores the resolved args as the process-level singleton
  - `getCliArgs()` - Returns the singleton CliArgs set by setCliArgsForProcess(), throws if called before bootstrap
  - `getDefaultCliArgs()` - Returns a default CliArgs without reading process.argv for safe fallback
  - `handleCliArgsEarlyExit(args)` - Handles --help and other early-exit flags before optimizer runs
  - `resetCliArgsResolutionForTests()` - Resets the singleton to undefined for Jest tests

- **Added 5 Missing CliArgs Properties:**
  - `udBoostedGateExperiment: boolean` - --ud-boosted-gate-experiment
  - `udBoostedBuilderViableLegsExperiment: boolean` - --ud-boosted-builder-viable-legs-experiment  
  - `failOnMergeQuality: boolean` - --fail-on-merge-quality hard-fail if merge ratio too low
  - `portfolioDiversification: boolean` - --portfolio-diversification enforce cross-card player spread
  - `udRawPicksJsonPath: string | null` - --ud-raw-picks-json-path <path> pin a JSON snapshot for replay

- **CLI Parsing Implementation:**
  - Added default values in parseArgs() result object
  - Added switch cases for all 5 new flags following existing patterns
  - Boolean flags default to false, string flag defaults to null

### 15. **src/load_underdog_props.ts (2026-03-27):** Added UD replay functionality
- **New Function:**
  - `loadRawPicksJsonSnapshot(filePath: string): RawPick[]` - Loads a raw picks JSON snapshot from disk for UD replay/pinned testing
  - Expects JSON array of RawPick objects
  - Synchronous file reading for use in fetchUnderdogRawPropsWithLogging
  - Throws errors for missing files or invalid JSON format
  - Used when cli.udRawPicksJsonPath is set

## Validation Status
- **LAST_VALIDATED:** 2026-03-27 (compile clean + mock dry-run, CLI bootstrap Phase 17X wired)
- **LAST_LIVE_RUN:** 2026-03-12 (live end-to-end; next live run pending)
