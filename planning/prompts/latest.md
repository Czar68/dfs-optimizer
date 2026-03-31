I'll break down the task of updating edge consensus algorithms with latest player data into actionable steps. Let me provide precise prompts for Windsurf Cascade to execute.

## Step 1: Analyze Current Project Structure
**Prompt:** Explore the project structure to understand how player data and consensus algorithms are organized. Look for:
- Player data storage location
- Edge consensus algorithm files
- Data fetching/update mechanisms

**Terminal commands:**
```bash
find . -name "*.ts" -o -name "*.js" | grep -E "(player|data|consensus|edge|algorithm)" -i | head -20
ls -la src/
ls -la src/algorithms/
ls -la src/data/
```

## Step 2: Check Current Player Data Structure
**Prompt:** Examine the existing player data structure to understand the schema and data flow.

**File paths to examine:**
- `src/types/Player.ts` or similar type definitions
- `src/data/players.ts` or data files
- `src/services/dataService.ts` or data fetching services

**Code to review:**
```typescript
// Look for Player interface/type definitions
interface Player {
  id: string;
  name: string;
  position: string;
  team: string;
  salary: number;
  projection: number;
  ownership: number;
  value: number;
  // ... other fields
}
```

## Step 3: Update Data Fetching Service
**Prompt:** Update or create a data fetching service to retrieve latest player data from the appropriate data source.

**File path:** `src/services/playerDataService.ts`

**Code to implement:**
```typescript
import axios from 'axios';
import { Player } from '../types/Player';
import { DataSourceConfig } from '../config/dataSources';

export class PlayerDataService {
  private readonly API_ENDPOINT: string;
  
  constructor() {
    this.API_ENDPOINT = DataSourceConfig.PLAYER_DATA_URL;
  }

  async fetchLatestPlayerData(): Promise<Player[]> {
    try {
      console.log('Fetching latest player data...');
      
      const response = await axios.get(`${this.API_ENDPOINT}/players/latest`, {
        params: {
          sport: 'nfl', // or basketball, baseball based on config
          slate: 'main', // or specify slate
          timestamp: new Date().toISOString()
        },
        headers: {
          'Authorization': `Bearer ${process.env.DATA_API_KEY}`
        }
      });

      return this.transformPlayerData(response.data);
    } catch (error) {
      console.error('Error fetching player data:', error);
      throw new Error('Failed to fetch latest player data');
    }
  }

  private transformPlayerData(rawData: any[]): Player[] {
    return rawData.map(player => ({
      id: player.player_id || player.id,
      name: player.name,
      position: player.position,
      team: player.team_abbreviation || player.team,
      salary: player.salary || player.draftkings_salary,
      projection: player.projected_points || player.projection,
      ownership: player.ownership_projection || player.ownership,
      value: this.calculateValue(player),
      injuryStatus: player.injury_status || 'healthy',
      matchup: player.matchup,
      // Add any new fields from latest data source
      ...(player.advanced_metrics && {
        advancedMetrics: player.advanced_metrics
      })
    }));
  }

  private calculateValue(player: any): number {
    if (!player.salary || !player.projection) return 0;
    return player.projection / (player.salary / 1000);
  }
}

export default new PlayerDataService();
```

## Step 4: Update Consensus Algorithm with New Data
**Prompt:** Modify the edge consensus algorithm to incorporate the latest player data structure and new metrics.

**File path:** `src/algorithms/edgeConsensus.ts`

**Code to update:**
```typescript
import { Player } from '../types/Player';
import playerDataService from '../services/playerDataService';
import { ConsensusWeight, AlgorithmConfig } from '../config/algorithmConfig';

export class EdgeConsensusAlgorithm {
  private weights: ConsensusWeight;
  
  constructor(config?: Partial<AlgorithmConfig>) {
    this.weights = {
      projection: config?.projectionWeight || 0.4,
      ownership: config?.ownershipWeight || 0.3,
      value: config?.valueWeight || 0.2,
      matchup: config?.matchupWeight || 0.1,
      // Add new weight for advanced metrics if available
      advancedMetrics: config?.advancedMetricsWeight || 0.0
    };
  }

  async calculateConsensus(): Promise<Player[]> {
    // Fetch latest player data
    const players = await playerDataService.fetchLatestPlayerData();
    
    // Calculate consensus score for each player
    const playersWithConsensus = players.map(player => ({
      ...player,
      consensusScore: this.calculatePlayerConsensus(player)
    }));

    // Sort by consensus score descending
    return playersWithConsensus.sort((a, b) => b.consensusScore - a.consensusScore);
  }

  private calculatePlayerConsensus(player: Player): number {
    let score = 0;
    
    // Normalize and weight each factor
    score += this.normalizeProjection(player.projection) * this.weights.projection;
    score += this.normalizeOwnership(player.ownership) * this.weights.ownership;
    score += this.normalizeValue(player.value) * this.weights.value;
    score += this.calculateMatchupScore(player.matchup) * this.weights.matchup;
    
    // Add new advanced metrics if available
    if (player.advancedMetrics) {
      score += this.calculateAdvancedMetricsScore(player.advancedMetrics) * 
               this.weights.advancedMetrics;
    }

    return score;
  }

  private normalizeProjection(projection: number): number {
    // Implement projection normalization logic
    const maxProjection = 50; // Adjust based on sport
    return Math.min(projection / maxProjection, 1);
  }

  private normalizeOwnership(ownership: number): number {
    // Lower ownership is better for GPPs, adjust based on contest type
    return 1 - Math.min(ownership / 100, 1);
  }

  private normalizeValue(value: number): number {
    // Value typically 0-10, normalize to 0-1
    return Math.min(value / 10, 1);
  }

  private calculateMatchupScore(matchup: string): number {
    // Implement matchup analysis
    // Return 0-1 based on matchup quality
    if (!matchup) return 0.5;
    
    // Example: Parse matchup string or use pre-calculated rating
    return 0.5; // Placeholder
  }

  private calculateAdvancedMetricsScore(metrics: any): number {
    // Process new advanced metrics from latest data
    // Example: Combine multiple advanced metrics
    let advancedScore = 0;
    
    if (metrics.usageRate) advancedScore += metrics.usageRate * 0.4;
    if (metrics.efficiency) advancedScore += metrics.efficiency * 0.3;
    if (metrics.defenseRating) advancedScore += (1 - metrics.defenseRating) * 0.3;
    
    return Math.min(advancedScore, 1);
  }

  // Method to update weights based on new data insights
  updateWeights(insights: any): void {
    // Dynamically adjust weights based on historical performance
    // or machine learning insights from new data
    this.weights = {
      ...this.weights,
      ...insights.optimizedWeights
    };
  }
}
```

## Step 5: Update Configuration for New Data Fields
**Prompt:** Update configuration files to include new data fields and algorithm parameters.

**File path:** `src/config/algorithmConfig.ts`

**Code to add:**
```typescript
export interface AlgorithmConfig {
  projectionWeight: number;
  ownershipWeight: number;
  valueWeight: number;
  matchupWeight: number;
  advancedMetricsWeight: number; // New field for advanced metrics
  contestType: 'GPP' | 'Cash';
  sport: 'nfl' | 'nba' | 'mlb' | 'nhl';
  slateId: string;
  
  // New configuration options for latest data
  includeAdvancedMetrics: boolean;
  dataFreshnessThreshold: number; // Hours
  minimumProjectionConfidence: number;
}

export const DEFAULT_CONFIG: AlgorithmConfig = {
  projectionWeight: 0.4,
  ownershipWeight: 0.3,
  valueWeight: 0.2,
  matchupWeight: 0.1,
  advancedMetricsWeight: 0.0, // Start at 0, adjust based on testing
  contestType: 'GPP',
  sport: 'nfl',
  slateId: 'main',
  includeAdvancedMetrics: false,
  dataFreshnessThreshold: 2,
  minimumProjectionConfidence: 0.7
};
```

## Step 6: Update Main Entry Point
**Prompt:** Update the main application file to use the latest player data with consensus algorithms.

**File path:** `src/index.ts` or `src/main.ts`

**Code to update:**
```typescript
import { EdgeConsensusAlgorithm } from './algorithms/edgeConsensus';
import { DEFAULT_CONFIG } from './config/algorithmConfig';
import { writeFileSync } from 'fs';
import path from 'path';

async function main() {
  console.log('DFS Optimizer - Updating with latest player data');
  
  // Initialize with configuration (can be loaded from environment)
  const config = {
    ...DEFAULT_CONFIG,
    sport: process.env.SPORT || 'nfl',
    contestType: process.env.CONTEST_TYPE || 'GPP',
    includeAdvancedMetrics: process.env.INCLUDE_ADVANCED_METRICS === 'true'
  };

  const algorithm = new EdgeConsensusAlgorithm(config);
  
  try {
    // Calculate consensus with latest data
    const optimalLineup = await algorithm.calculateConsensus();
    
    // Output results
    console.log('\n=== Top 20 Players by Edge Consensus ===');
    optimalLineup.slice(0, 20).forEach((player, index) => {
      console.log(`${index + 1}. ${player.name} (${player.position} - ${player.team}):`);
      console.log(`   Salary: $${player.salary}, Projection: ${player.projection.toFixed(2)}`);
      console.log(`   Ownership: ${player.ownership.toFixed(1)}%, Value: ${player.value.toFixed(2)}`);
      console.log(`   Consensus Score: ${player.consensusScore.toFixed(3)}\n`);
    });

    // Save to file
    const outputPath = path.join(__dirname, '../output/optimal_lineup.json');
    writeFileSync(outputPath, JSON.stringify(optimalLineup, null, 2));
    console.log(`Results saved to: ${outputPath}`);

  } catch (error) {
    console.error('Error in consensus calculation:', error);
    process.exit(1);
  }
}

// Run the application
if (require.main === module) {
  main();
}
```

## Step 7: Create Update Script
**Prompt:** Create a script to regularly update player data and recalculate consensus.

**File path:** `scripts/updateDataAndConsensus.ts`

**Code to create:**
```typescript
#!/usr/bin/env ts-node
import { EdgeConsensusAlgorithm } from '../src/algorithms/edgeConsensus';
import playerDataService from '../src/services/playerDataService';
import { CronJob } from 'cron';

// Update data and recalculate consensus on schedule
const job = new CronJob('0 */2 * * *', async () => { // Every 2 hours
  console.log('Scheduled update: Fetching latest player data...');
  
  try {
    // Force fetch latest data
    const players = await playerDataService.fetchLatestPlayerData();
    console.log(`Fetched ${players.length} players`);
    
    const algorithm = new EdgeConsensusAlgorithm();
    const consensus = await algorithm.calculateConsensus();
    
    console.log('Consensus updated successfully');
    
    // Trigger downstream processes (optimization, notifications, etc.)
    // ... additional logic
    
  } catch (error) {
    console.error('Scheduled update failed:', error);
  }
});

// Start the job
job.start();
console.log('Data update scheduler started. Updates will run every 2 hours.');
```

## Step 8: Update Dependencies and Environment
**Terminal commands:**
```bash
# Update package.json with any new dependencies
npm install axios cron
npm install --save-dev @types/node @types/cron

# Create environment configuration
echo "DATA_API_KEY=your_api_key_here" > .env
echo "SPORT=nfl" >> .env
echo "CONTEST_TYPE=GPP" >> .env

# Create output directory
mkdir -p output
```

## Step 9: Test the Updates
**Terminal commands:**
```bash
# Run the main application
npm run start
# or
npx ts-node src/index.ts

# Test the data service
npx ts-node src/services/playerDataService.ts

# Run the update script
npx ts-node scripts/updateDataAndConsensus.ts
```

## Step 10: Create Validation Script
**Prompt:** Create a script to validate that new player data is being properly integrated.

**File path:** `scripts/validateDataIntegration.ts`

**Code to create:**
```typescript
import playerDataService from '../src/services/playerDataService';
import { EdgeConsensusAlgorithm } from '../src/algorithms/edgeConsensus';

async function validateIntegration() {
  console.log('Validating data integration...\n');
  
  // Test 1: Fetch data
  console.log('1. Testing data fetch...');
  const players = await playerDataService.fetchLatestPlayerData();
  console.log(`   ✓ Fetched ${players.length} players`);
  
  // Test 2: Check required fields
  const samplePlayer = players[0];
  const requiredFields = ['id', 'name', 'position', 'salary', 'projection'];
  const missingFields = requiredFields.filter(field => !(field in samplePlayer));
  
  if (missingFields.length === 0) {
    console.log('   ✓ All required fields present');
  } else {
    console.log(`   ✗ Missing fields: ${missingFields.join(', ')}`);
  }
  
  // Test 3: Test consensus calculation
  console.log('\n2. Testing consensus algorithm...');
  const algorithm = new EdgeConsensusAlgorithm();
  const consensus = await algorithm.calculateConsensus();
  
  if (consensus.length === players.length) {
    console.log('   ✓ Consensus calculated for all players');
  }
  
  // Test 4: Check sorting
  const isSorted = consensus.every((player, i, arr) => 
    i === 0 || player.consensusScore <= arr[i - 1].consensusScore
  );
  console.log(`   ✓ Results properly sorted: ${isSorted}`);
  
  console.log('\n✅ Validation complete!');
}

validateIntegration().catch(console.error);
```

Each step is designed to be executed independently in Windsurf Cascade. Start with Step 1 to understand the current structure, then proceed through the steps in order. The prompts include specific file paths, code snippets, and terminal commands for precise execution.