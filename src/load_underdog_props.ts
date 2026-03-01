// src/load_underdog_props.ts
import fs from "fs";
import path from "path";
import { RawPick, StatCategory, Sport } from "./types";

// Map stat types to StatCategory union
function mapStatType(statType: string): StatCategory {
  const key = statType.toLowerCase();

  if (key === "points" || key === "pts") return "points";
  if (key === "rebounds" || key === "rebs") return "rebounds";
  if (key === "assists" || key === "asts") return "assists";

  if (key === "points_rebounds_assists" || key === "pra") return "pra";
  if (key === "points_rebounds" || key === "pr") return "points_rebounds";
  if (key === "points_assists" || key === "pa") return "points_assists";
  if (key === "rebounds_assists" || key === "ra") return "rebounds_assists";

  if (
    key === "three_pointers_made" ||
    key === "three_pointers" ||
    key === "threes"
  )
    return "threes";

  if (key === "blocks") return "blocks";
  if (key === "steals") return "steals";
  if (key === "blocks_steals" || key === "stocks") return "stocks";

  if (key === "turnovers") return "turnovers";

  if (key === "fantasy" || key === "fantasy_score") return "fantasy_score";

  // Fallback: treat unknown stat types as points so we don't break the pipeline.
  return "points";
}

// Interface for props JSON files (matches underdog_manual_props.json format)
interface PropsData {
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

/**
 * Load Underdog props from a JSON file and convert to RawPick[] format
 * @param filePath - Path to the JSON file containing props
 * @param sourceName - Name of the source for logging (e.g., "scraped", "manual")
 * @returns Promise<RawPick[]> - Array of props in RawPick format
 */
export async function loadUnderdogPropsFromFile(filePath: string, sourceName: string): Promise<RawPick[]> {
  try {
    if (!fs.existsSync(filePath)) {
      console.log(`[UD] ${sourceName} file not found: ${filePath}`);
      return [];
    }

    const fileContent = fs.readFileSync(filePath, "utf8");
    const data = JSON.parse(fileContent) as PropsData;

    if (!data.props || !Array.isArray(data.props)) {
      console.log(`[UD] ${sourceName} file has invalid format: ${filePath}`);
      return [];
    }

    const picks: RawPick[] = [];

    for (const prop of data.props) {
      // Validate required fields
      if (!prop.player || !prop.stat || prop.line === undefined || prop.line === null) {
        console.warn(`[UD] Skipping invalid prop in ${sourceName} file:`, prop);
        continue;
      }

      const stat: StatCategory = mapStatType(prop.stat);

      const rawPick: RawPick = {
        sport: "NBA", // Underdog currently only supports NBA
        site: "underdog",
        league: "NBA",
        player: prop.player.trim(),
        team: prop.team || null,
        opponent: prop.opponent || null,
        stat,
        line: prop.line,
        projectionId: `${sourceName}_${prop.player.replace(/\s+/g, '_')}_${prop.stat}`,
        gameId: `${sourceName}_game_${prop.team || 'TBD'}_vs_${prop.opponent || 'TBD'}`,
        startTime: new Date().toISOString(), // Current time as placeholder
        isDemon: false,
        isGoblin: false,
        isPromo: false,
        isNonStandardOdds: false,
      };

      picks.push(rawPick);
    }

    console.log(`[UD] Loaded ${picks.length} props from ${sourceName} file: ${filePath}`);
    return picks;

  } catch (error) {
    console.error(`[UD] Error loading ${sourceName} props from ${filePath}:`, error);
    return [];
  }
}
