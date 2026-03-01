// src/bankroll_tracker.ts (minimal)

import fs from 'fs/promises';
import path from 'path';

interface BankrollLog {
  date: string;
  time: string;
  bankroll: number;
  oddsProvider: string;
  sportsProcessed: string[];
  timestamp: string;
}

export async function logBankrollUsage(
  bankroll = 1000,
  oddsProvider = 'unknown',
  sportsProcessed: string[] = []
): Promise<void> {
  const now = new Date();
  const isoString = now.toISOString();
  const [date, time] = isoString.split('T');
  
  const log: BankrollLog = {
    date,
    time: time.split('.')[0], // Remove milliseconds
    bankroll,
    oddsProvider,
    sportsProcessed,
    timestamp: isoString
  };

  try {
    await fs.mkdir('.cache', { recursive: true });
    await fs.writeFile(
      path.join('.cache', 'bankroll.json'),
      JSON.stringify(log, null, 2)
    );
    console.log(`[Bankroll] Logged usage: ${bankroll} via ${oddsProvider} for [${sportsProcessed.join(',')}]`);
  } catch (error) {
    console.error('[Bankroll] Failed to log usage:', error);
  }
}

export async function logProductionRun(provider: string, sports: string[], bankroll?: number): Promise<void> {
  await logBankrollUsage(bankroll ?? 1000, provider, sports);
}
