import fs from 'fs';
import path from 'path';

const TRACKER_FILE = path.join(process.cwd(), 'token_tracker.json');

interface TokenState {
  lastRemaining: number | null;
  lastUpdated: string;
}

export function loadTokenState(): TokenState {
  try {
    if (fs.existsSync(TRACKER_FILE)) {
      return JSON.parse(fs.readFileSync(TRACKER_FILE, 'utf-8'));
    }
  } catch (e) {
    // File exists but is corrupted, continue with default
  }
  return { lastRemaining: null, lastUpdated: '' };
}

export function saveTokenState(remaining: number | null) {
  const state: TokenState = {
    lastRemaining: remaining,
    lastUpdated: new Date().toISOString(),
  };
  fs.writeFileSync(TRACKER_FILE, JSON.stringify(state, null, 2));
}
