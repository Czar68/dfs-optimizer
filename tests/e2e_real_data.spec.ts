/**
 * E2E: Real data pipeline — npm run generate -- --platform pp must produce
 * prizepicks_imported.csv with >1000 rows and real NBA players (no synthetic Haliburton).
 * File location follows centralized path constants (OUTPUT_DIR / getOutputPath).
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { getOutputPath, OUTPUT_DIR, PP_IMPORTED_CSV } from '../src/constants/paths';

const ROOT = path.join(__dirname, '..');
/** Resolve path via paths.ts so tests look where the pipeline writes (OUTPUT_DIR). */
const PP_IMPORTED = getOutputPath(PP_IMPORTED_CSV, ROOT);
const MOCK_PLAYER = 'Haliburton'; // synthetic mock_legs player name

describe('E2E real data', () => {
  afterAll(() => {
    // execSync is synchronous: the child process exits before this runs, so no process to kill.
    // This suite does not open long-lived file streams (readFileSync closes after read).
    // If this suite is ever switched to spawn/exec, store the ChildProcess and call kill() here.
    // Clear any module-level timers/intervals here if added in the future.
  });

  it('generate --platform pp produces prizepicks_imported.csv with >1000 rows and real NBA players (no synth Haliburton)', () => {
    execSync('npm run generate -- --platform pp --no-require-alt-lines --no-guardrails', {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: 120000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    expect(fs.existsSync(PP_IMPORTED)).toBe(true);
    const content = fs.readFileSync(PP_IMPORTED, 'utf8');
    const lines = content.trim().split(/\r?\n/).filter((line) => line.length > 0);
    const dataRows = lines.length > 1 ? lines.length - 1 : 0; // subtract header

    expect(dataRows).toBeGreaterThan(1000);

    // Real data: no synthetic mock player (Haliburton is in mock_legs PLAYERS list)
    const hasSynthPlayer = content.includes(MOCK_PLAYER);
    expect(hasSynthPlayer).toBe(false);
  }, 125000);
});
