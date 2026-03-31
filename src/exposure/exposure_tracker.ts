// src/exposure/exposure_tracker.ts
// Tracks player exposure during slip building to prevent over-concentration

export interface ExposureLimit {
  maxPerPlayer: number;      // % of bankroll
  maxPerGame?: number;       // % of bankroll per game
  maxPerSlate?: number;      // % of bankroll total for slate
}

export interface ExposureSnapshot {
  playerId: string;
  totalStake: number;
  percentageOfBankroll: number;
  slipCount: number;
}

export class ExposureTracker {
  private exposure: Map<string, number> = new Map();
  private slipCount: Map<string, number> = new Map();
  private totalStake: number = 0;
  
  constructor(
    private bankroll: number,
    private limits: ExposureLimit = { maxPerPlayer: 0.15 }
  ) {}

  /**
   * Check if a leg can be added without exceeding exposure limits
   */
  canAddLeg(playerId: string, stake: number): { allowed: boolean; reason?: string } {
    const current = this.exposure.get(playerId) || 0;
    const newExposure = current + stake;
    const maxAllowed = this.bankroll * this.limits.maxPerPlayer;
    
    if (newExposure > maxAllowed) {
      const currentPct = (current / this.bankroll * 100).toFixed(1);
      const newPct = (newExposure / this.bankroll * 100).toFixed(1);
      return {
        allowed: false,
        reason: `${playerId}: would exceed ${this.limits.maxPerPlayer * 100}% cap (${currentPct}% → ${newPct}%)`,
      };
    }
    
    return { allowed: true };
  }

  /**
   * Add a leg to the tracker (call after slip is built)
   */
  addLeg(playerId: string, stake: number): void {
    const current = this.exposure.get(playerId) || 0;
    this.exposure.set(playerId, current + stake);
    this.slipCount.set(playerId, (this.slipCount.get(playerId) || 0) + 1);
    this.totalStake += stake;
  }

  /**
   * Get current exposure for a player
   */
  getExposure(playerId: string): ExposureSnapshot | null {
    const totalStake = this.exposure.get(playerId);
    if (totalStake === undefined) return null;
    
    return {
      playerId,
      totalStake,
      percentageOfBankroll: totalStake / this.bankroll,
      slipCount: this.slipCount.get(playerId) || 0,
    };
  }

  /**
   * Get all players with exposure
   */
  getAllExposures(): ExposureSnapshot[] {
    const results: ExposureSnapshot[] = [];
    for (const [playerId, totalStake] of Array.from(this.exposure.entries())) {
      results.push({
        playerId,
        totalStake,
        percentageOfBankroll: totalStake / this.bankroll,
        slipCount: this.slipCount.get(playerId) || 0,
      });
    }
    return results.sort((a, b) => b.percentageOfBankroll - a.percentageOfBankroll);
  }

  /**
   * Get total risk for the slate
   */
  getTotalRisk(): { totalStake: number; percentageOfBankroll: number } {
    return {
      totalStake: this.totalStake,
      percentageOfBankroll: this.totalStake / this.bankroll,
    };
  }

  /**
   * Reset tracker for new slate
   */
  reset(): void {
    this.exposure.clear();
    this.slipCount.clear();
    this.totalStake = 0;
  }

  /**
   * Generate report
   */
  report(): string {
    const exposures = this.getAllExposures();
    const total = this.getTotalRisk();
    
    let report = '\n📊 EXPOSURE REPORT\n';
    report += '═'.repeat(50) + '\n';
    report += `Total risk: $${total.totalStake.toFixed(2)} (${(total.percentageOfBankroll * 100).toFixed(1)}% of bankroll)\n`;
    report += `Players exposed: ${exposures.length}\n\n`;
    
    if (exposures.length > 0) {
      report += 'Top exposures:\n';
      exposures.slice(0, 10).forEach(e => {
        report += `  ${e.playerId}: $${e.totalStake.toFixed(2)} (${(e.percentageOfBankroll * 100).toFixed(1)}%) in ${e.slipCount} slips\n`;
      });
    }
    
    report += '═'.repeat(50);
    return report;
  }
}
