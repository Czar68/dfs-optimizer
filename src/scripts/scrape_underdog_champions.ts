// src/scripts/scrape_underdog_champions.ts
// 
// AUTHENTICATION REQUIREMENTS:
// ===========================
// This scraper assumes the user is logged in to Underdog in the browser profile that Playwright uses.
// 
// Required setup:
// 1. User must be logged in to https://app.underdogfantasy.com/
// 2. Any location/age/state verification prompts must be previously resolved
// 3. User must have access to NBA Pick'em markets
// 
// Using persistent context (recommended):
// - The script uses a persistent user data directory to reuse login sessions
// - Default userDataDir: "./playwright_profile" 
// - To use an existing Chrome profile, specify the full path to the profile directory
// - Example: userDataDir: "C:/Users/YourUser/AppData/Local/Google/Chrome/User Data/Profile 1"
//
// If scraping fails with "no props found":
// 1. Set DEBUG_SCRAPER = true to enable HTML debugging
// 2. Run the script and inspect underdog_scraper_debug.html
// 3. Check if you're properly logged in and can see NBA props
// 4. Adjust selectors based on the actual DOM structure

import fs from "fs";
import path from "path";
import { chromium, Browser, Page } from "playwright";

// Debug mode - set to true to dump HTML when no props are found
const DEBUG_SCRAPER = false;

// Interface for scraped prop data
interface ScrapedProp {
  player: string;
  team: string;
  opponent?: string;
  stat: string;
  line: number;
  direction?: string; // "higher" or "lower"
  marketId?: string;
}

// Interface for output JSON (matches underdog_manual_props.json shape)
interface ScrapedPropsOutput {
  props: {
    player: string;
    team: string;
    opponent: string;
    stat: string;
    line: number;
    overOdds: number;
    underOdds: number;
  }[];
}

// Map scraped stat names to our StatCategory format
function normalizeStatType(stat: string): string {
  const normalized = stat.toLowerCase().trim();
  
  // Handle common variations
  if (normalized.includes("point") || normalized.includes("pts")) return "points";
  if (normalized.includes("rebound") || normalized.includes("reb")) return "rebounds";
  if (normalized.includes("assist") || normalized.includes("ast")) return "assists";
  if (normalized.includes("three") || normalized.includes("3") || normalized.includes("triple")) return "threes";
  if (normalized.includes("block") || normalized.includes("blk")) return "blocks";
  if (normalized.includes("steal") || normalized.includes("stl")) return "steals";
  if (normalized.includes("turnover") || normalized.includes("to")) return "turnovers";
  if (normalized.includes("fantasy") || normalized.includes("fd")) return "fantasy_score";
  
  // Handle combined stats
  if (normalized.includes("pra") || normalized.includes("points rebounds assists")) return "pra";
  if (normalized.includes("pr") || normalized.includes("points rebounds")) return "points_rebounds";
  if (normalized.includes("pa") || normalized.includes("points assists")) return "points_assists";
  if (normalized.includes("ra") || normalized.includes("rebounds assists")) return "rebounds_assists";
  if (normalized.includes("stocks") || normalized.includes("blocks steals")) return "stocks";
  
  // Default fallback
  return "points";
}

// Extract team info from player display (e.g., "LAL vs GSW" -> team: "LAL", opponent: "GSW")
function parseTeamInfo(teamText: string): { team: string; opponent: string } {
  if (!teamText) return { team: "", opponent: "" };
  
  // Handle "LAL vs GSW" format
  const vsMatch = teamText.match(/(\w+)\s+vs\s+(\w+)/i);
  if (vsMatch) {
    return { team: vsMatch[1].toUpperCase(), opponent: vsMatch[2].toUpperCase() };
  }
  
  // Handle "@GSW" format (away game)
  const awayMatch = teamText.match(/@(\w+)/i);
  if (awayMatch) {
    return { team: "", opponent: awayMatch[1].toUpperCase() };
  }
  
  // Handle just team code
  return { team: teamText.toUpperCase(), opponent: "" };
}

async function scrapeUnderdogChampions(): Promise<void> {
  console.log("[UD SCRAPER] Starting Underdog Champions page scraper...");
  
  let context: any = null;
  
  try {
    // Launch browser with persistent context for login reuse
    const userDataDir = path.join(process.cwd(), "playwright_profile");
    
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false, // Show browser for manual login/debugging
      viewport: { width: 1920, height: 1080 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      args: [
        '--no-sandbox',
        '--disable-blink-features=AutomationControlled'
      ]
    });
    
    const page = await context.newPage();
    
    // Navigate to Champions page
    const championsUrl = "https://app.underdogfantasy.com/pick-em/higher-lower/all/NBA";
    console.log(`[UD SCRAPER] Navigating to: ${championsUrl}`);
    
    await page.goto(championsUrl, { waitUntil: 'networkidle' });
    
    // Wait for page to load and check if we're logged in
    console.log("[UD SCRAPER] Waiting for page to load...");
    
    // Check for login indicators - if we see login/signup buttons, we're not logged in
    const loginIndicators = await page.locator('button:has-text("Log in"), button:has-text("Sign up"), a:has-text("Log in")').count();
    if (loginIndicators > 0) {
      console.log("[UD SCRAPER] WARNING: Login/signup buttons detected. You may not be logged in.");
      console.log("[UD SCRAPER] Please log in to Underdog in the browser window that opened.");
      
      // Give user time to log in
      console.log("[UD SCRAPER] Waiting 30 seconds for manual login...");
      await page.waitForTimeout(30000);
    }
    
    // Use a concrete selector for props - based on common Underdog DOM patterns
    // This targets the main prop containers in the pick'em list
    const propSelector = '[data-testid="proposition-card"], .proposition-card, .pickem-prop-card, [class*="prop-card"], [class*="proposition"]';
    
    console.log(`[UD SCRAPER] Looking for props with selector: ${propSelector}`);
    
    // Wait for props to appear with a longer timeout
    try {
      await page.waitForSelector(propSelector, { timeout: 30000 });
      console.log("[UD SCRAPER] Props selector found on page");
    } catch (e) {
      console.log("[UD SCRAPER] WARNING: Props selector not found within timeout");
      
      // Debug mode: dump HTML if no props found
      if (DEBUG_SCRAPER) {
        const html = await page.content();
        const debugPath = path.join(process.cwd(), "underdog_scraper_debug.html");
        fs.writeFileSync(debugPath, html, "utf8");
        console.log(`[UD SCRAPER] DEBUG: Page HTML dumped to: ${debugPath}`);
        console.log("[UD SCRAPER] DEBUG: Open this file in a browser to inspect the actual DOM structure");
      }
      
      throw new Error("No props rows found. Are you logged in and allowed to see NBA pick'em?");
    }
    
    // Get all prop elements
    const propElements = await page.locator(propSelector).all();
    console.log(`[UD SCRAPER] Found ${propElements.length} prop elements`);
    
    if (propElements.length === 0) {
      // Debug mode: dump HTML if no props found
      if (DEBUG_SCRAPER) {
        const html = await page.content();
        const debugPath = path.join(process.cwd(), "underdog_scraper_debug.html");
        fs.writeFileSync(debugPath, html, "utf8");
        console.log(`[UD SCRAPER] DEBUG: Page HTML dumped to: ${debugPath}`);
        console.log("[UD SCRAPER] DEBUG: Open this file in a browser to inspect the actual DOM structure");
      }
      
      throw new Error("No props rows found. Are you logged in and allowed to see NBA pick'em?");
    }
    
    // Extract data from each prop
    const scrapedProps: ScrapedProp[] = [];
    
    for (let i = 0; i < propElements.length; i++) {
      try {
        const element = propElements[i];
        
        // Extract player name (try multiple selectors)
        const playerSelectors = [
          '[class*="player"]',
          '[class*="name"]',
          '.player-name',
          'h3',
          'h4',
          '[data-testid*="player"]'
        ];
        
        let playerName = "";
        for (const selector of playerSelectors) {
          try {
            const text = await element.locator(selector).first().textContent();
            if (text && text.trim()) {
              playerName = text.trim();
              break;
            }
          } catch (e) {
            // Continue to next selector
          }
        }
        
        // Extract stat type
        const statSelectors = [
          '[class*="stat"]',
          '[class*="category"]',
          '.stat-type',
          '[data-testid*="stat"]'
        ];
        
        let statType = "";
        for (const selector of statSelectors) {
          try {
            const text = await element.locator(selector).first().textContent();
            if (text && text.trim()) {
              statType = text.trim();
              break;
            }
          } catch (e) {
            // Continue to next selector
          }
        }
        
        // Extract line value
        const lineSelectors = [
          '[class*="line"]',
          '[class*="value"]',
          '.line-value',
          '[data-testid*="line"]'
        ];
        
        let lineValue = 0;
        for (const selector of lineSelectors) {
          try {
            const text = await element.locator(selector).first().textContent();
            if (text) {
              const match = text.match(/(\d+\.?\d*)/);
              if (match) {
                lineValue = parseFloat(match[1]);
                break;
              }
            }
          } catch (e) {
            // Continue to next selector
          }
        }
        
        // Extract team info
        const teamSelectors = [
          '[class*="team"]',
          '[class*="matchup"]',
          '.team-info',
          '[data-testid*="team"]'
        ];
        
        let teamText = "";
        for (const selector of teamSelectors) {
          try {
            const text = await element.locator(selector).first().textContent();
            if (text && text.trim()) {
              teamText = text.trim();
              break;
            }
          } catch (e) {
            // Continue to next selector
          }
        }
        
        const { team, opponent } = parseTeamInfo(teamText);
        
        // Only add if we have essential data
        if (playerName && statType && lineValue > 0) {
          scrapedProps.push({
            player: playerName,
            team,
            opponent: opponent || "",
            stat: normalizeStatType(statType),
            line: lineValue
          });
        }
        
      } catch (e) {
        console.warn(`[UD SCRAPER] Error extracting prop ${i}:`, e);
      }
    }
    
    console.log(`[UD SCRAPER] Successfully scraped ${scrapedProps.length} NBA props`);
    
    // Convert to output format (matching underdog_manual_props.json)
    const output: ScrapedPropsOutput = {
      props: scrapedProps.map(prop => ({
        player: prop.player,
        team: prop.team,
        opponent: prop.opponent || "",
        stat: prop.stat,
        line: prop.line,
        overOdds: -110, // Default odds (can be enhanced later)
        underOdds: -110  // Default odds (can be enhanced later)
      }))
    };
    
    // Write to file
    const outputPath = path.join(process.cwd(), "underdog_props_scraped.json");
    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), "utf8");
    
    console.log(`[UD SCRAPER] Wrote ${output.props.length} props to ${outputPath}`);
    console.log(`[UD SCRAPER] Scraped ${output.props.length} NBA props from Champions page`);
    
  } catch (error) {
    console.error("[UD SCRAPER] Error during scraping:", error);
    throw error;
  } finally {
    if (context) {
      await context.close();
    }
  }
}

// Run scraper if this file is executed directly
if (require.main === module) {
  scrapeUnderdogChampions().catch(error => {
    console.error("[UD SCRAPER] Scraping failed:", error);
    process.exit(1);
  });
}

export { scrapeUnderdogChampions, ScrapedProp, ScrapedPropsOutput };
