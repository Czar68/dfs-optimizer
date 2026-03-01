/**
 * E2E: Real data pipeline — npm run generate -- --pp --no-mocks must produce
 * prizepicks_imported.csv with >1000 rows and real NBA players (no synthetic Haliburton).
 */
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const ROOT = path.join(__dirname, '..');
const PP_IMPORTED = path.join(ROOT, 'prizepicks_imported.csv');
const MOCK_PLAYER = 'Haliburton'; // synthetic mock_legs player name

describe('E2E real data', () => {
  it('generate --pp --no-mocks produces prizepicks_imported.csv with >1000 rows and real NBA players (no synth Haliburton)', () => {
    execSync('npm run generate -- --pp --no-mocks', {
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
