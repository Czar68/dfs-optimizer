// src/logger.ts
// Enhanced logging infrastructure for daily betting operations

import fs from 'fs';
import path from 'path';
import { Sport, FlexType } from './types';

export interface DailyMetrics {
  date: string;
  bankroll: number;
  optimizers: {
    prizepicks: OptimizerMetrics;
    underdog: OptimizerMetrics;
    sportsbook_singles: SportsbookMetrics;
  };
  correlationFilters: CorrelationFilterMetrics;
  stakeSizing: StakeSizingMetrics;
  timestamp: string;
}

export interface OptimizerMetrics {
  propsLoaded: number;
  propsMerged: number;
  cardsGenerated: number;
  cardsByStructure: Record<string, number>;
  avgEvByStructure: Record<string, number>;
  totalEvGenerated: number;
  totalKellyAllocation: number;
  runTime: number;
  success: boolean;
}

export interface SportsbookMetrics {
  marketsLoaded: number;
  singlesGenerated: number;
  totalEdgeGenerated: number;
  totalKellyAllocation: number;
  runTime: number;
  success: boolean;
}

export interface CorrelationFilterMetrics {
  cardsRemovedSamePlayer: number;
  cardsAdjustedTeamConcentration: number;
  correlationConflicts: number;
  structureViolations: number;
}

export interface StakeSizingMetrics {
  totalRecommendedStake: number;
  bankrollPercentageAtRisk: number;
  scalingApplied: boolean;
  droppedCards: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
}

export class BettingLogger {
  private logDir: string;
  private currentSession: string;
  private consoleLog: boolean;

  constructor(logDir: string = 'logs', consoleLog: boolean = true) {
    this.logDir = logDir;
    this.consoleLog = consoleLog;
    this.currentSession = this.generateSessionId();
    this.ensureLogDirectory();
  }

  private generateSessionId(): string {
    const now = new Date();
    return now.toISOString().replace(/[:.]/g, '-');
  }

  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  private formatMessage(level: string, message: string): string {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] ${message}`;
  }

  private writeLog(level: string, message: string): void {
    const formattedMessage = this.formatMessage(level, message);
    const logFile = path.join(this.logDir, `daily_run_${this.currentSession.split('T')[0]}.log`);
    
    // Write to file
    fs.appendFileSync(logFile, formattedMessage + '\n');
    
    // Console output if enabled
    if (this.consoleLog) {
      console.log(formattedMessage);
    }
  }

  info(message: string): void {
    this.writeLog('INFO', message);
  }

  error(message: string): void {
    this.writeLog('ERROR', message);
  }

  warn(message: string): void {
    this.writeLog('WARN', message);
  }

  debug(message: string): void {
    this.writeLog('DEBUG', message);
  }

  startSession(bankroll: number, maxKellyFraction: number, dailyRiskCap: number): void {
    this.info('=== DAILY BETTING RUN STARTED ===');
    this.info(`Bankroll: $${bankroll} | Max Kelly: ${(maxKellyFraction * 100).toFixed(1)}% | Daily Risk Cap: ${(dailyRiskCap * 100).toFixed(1)}%`);
    this.info(`Session ID: ${this.currentSession}`);
  }

  logOptimizerStart(optimizer: string): void {
    this.info(`Starting ${optimizer} optimizer...`);
  }

  logOptimizerComplete(optimizer: string, metrics: OptimizerMetrics | SportsbookMetrics): void {
    this.info(`${optimizer} completed in ${metrics.runTime.toFixed(2)}s`);
    
    if ('propsLoaded' in metrics) {
      this.info(`  Props: ${metrics.propsLoaded} loaded → ${metrics.propsMerged} merged → ${metrics.cardsGenerated} cards`);
      
      // Log structure breakdown
      const structureBreakdown = Object.entries(metrics.cardsByStructure)
        .map(([structure, count]) => `${structure}:${count}`)
        .join(', ');
      this.info(`  Structures: ${structureBreakdown}`);
      
      // Log EV stats
      this.info(`  Total EV: ${(metrics.totalEvGenerated * 100).toFixed(1)}% | Kelly: ${(metrics.totalKellyAllocation * 100).toFixed(1)}%`);
    } else {
      this.info(`  Markets: ${metrics.marketsLoaded} loaded → ${metrics.singlesGenerated} singles`);
      this.info(`  Total Edge: ${(metrics.totalEdgeGenerated * 100).toFixed(1)}% | Kelly: ${(metrics.totalKellyAllocation * 100).toFixed(1)}%`);
    }
  }

  logOptimizerError(optimizer: string, error: string): void {
    this.error(`${optimizer} failed: ${error}`);
  }

  logCorrelationFilters(metrics: CorrelationFilterMetrics): void {
    this.info('Correlation filters applied:');
    this.info(`  Same player conflicts: ${metrics.cardsRemovedSamePlayer} cards removed`);
    this.info(`  Team concentration: ${metrics.cardsAdjustedTeamConcentration} cards adjusted`);
    this.info(`  Correlation conflicts: ${metrics.correlationConflicts} pairs flagged`);
    this.info(`  Structure violations: ${metrics.structureViolations} cards removed`);
  }

  logStakeSizing(metrics: StakeSizingMetrics): void {
    this.info('Stake sizing complete:');
    this.info(`  Total recommended stake: $${metrics.totalRecommendedStake.toFixed(2)}`);
    this.info(`  Bankroll at risk: ${(metrics.bankrollPercentageAtRisk * 100).toFixed(1)}%`);
    this.info(`  Risk level: ${metrics.riskLevel}`);
    
    if (metrics.scalingApplied) {
      this.warn(`  Scaling applied: ${metrics.droppedCards} cards dropped below minimum stake`);
    } else {
      this.info(`  No scaling required`);
    }
  }

  logSheetsPush(sheet: string, success: boolean): void {
    if (success) {
      this.info(`Pushed to ${sheet} successfully`);
    } else {
      this.error(`Failed to push to ${sheet}`);
    }
  }

  logSessionComplete(totalTime: number, finalMetrics: DailyMetrics): void {
    this.info('=== DAILY RUN COMPLETED SUCCESSFULLY ===');
    this.info(`Total runtime: ${(totalTime / 60).toFixed(2)} minutes`);
    
    // Summary stats
    const totalCards = finalMetrics.optimizers.prizepicks.cardsGenerated + finalMetrics.optimizers.underdog.cardsGenerated;
    const totalSingles = finalMetrics.optimizers.sportsbook_singles.singlesGenerated;
    const totalStake = finalMetrics.stakeSizing.totalRecommendedStake;
    
    this.info(`Summary: ${totalCards} cards + ${totalSingles} singles = $${totalStake.toFixed(2)} total stake`);
    this.info(`Risk level: ${finalMetrics.stakeSizing.riskLevel} (${(finalMetrics.stakeSizing.bankrollPercentageAtRisk * 100).toFixed(1)}% of bankroll)`);
    
    if (finalMetrics.stakeSizing.scalingApplied) {
      this.warn(`Scaling was applied to meet risk caps`);
    }
  }

  saveMetrics(metrics: DailyMetrics): void {
    const metricsFile = path.join(this.logDir, `metrics_${metrics.date}.json`);
    fs.writeFileSync(metricsFile, JSON.stringify(metrics, null, 2));
    this.info(`Metrics saved: ${metricsFile}`);
  }

  // Utility method to parse optimizer output and extract metrics
  parseOptimizerOutput(output: string, optimizer: string): OptimizerMetrics | SportsbookMetrics {
    const lines = output.split('\n');
    const metrics: any = {
      runTime: 0,
      success: true,
    };

    // Parse common metrics (this would need to be customized based on actual output format)
    for (const line of lines) {
      if (line.includes('props loaded')) {
        const match = line.match(/(\d+)\s+props/);
        if (match) metrics.propsLoaded = parseInt(match[1]);
      }
      if (line.includes('merged')) {
        const match = line.match(/(\d+)\s+merged/);
        if (match) metrics.propsMerged = parseInt(match[1]);
      }
      if (line.includes('cards')) {
        const match = line.match(/(\d+)\s+cards/);
        if (match) metrics.cardsGenerated = parseInt(match[1]);
      }
      if (line.includes('singles')) {
        const match = line.match(/(\d+)\s+singles/);
        if (match) metrics.singlesGenerated = parseInt(match[1]);
      }
    }

    // Set defaults for missing values
    if (optimizer !== 'sportsbook_singles') {
      metrics.propsLoaded = metrics.propsLoaded || 0;
      metrics.propsMerged = metrics.propsMerged || 0;
      metrics.cardsGenerated = metrics.cardsGenerated || 0;
      metrics.cardsByStructure = {};
      metrics.avgEvByStructure = {};
      metrics.totalEvGenerated = 0;
      metrics.totalKellyAllocation = 0;
    } else {
      metrics.marketsLoaded = metrics.marketsLoaded || 0;
      metrics.singlesGenerated = metrics.singlesGenerated || 0;
      metrics.totalEdgeGenerated = 0;
      metrics.totalKellyAllocation = 0;
    }

    return metrics;
  }
}

// Global logger instance
export const logger = new BettingLogger();

// Export convenience functions
export const logInfo = (message: string) => logger.info(message);
export const logError = (message: string) => logger.error(message);
export const logWarn = (message: string) => logger.warn(message);
export const logDebug = (message: string) => logger.debug(message);
