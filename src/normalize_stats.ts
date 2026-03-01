// src/normalize_stats.ts

// The goal is to map different book / API stat categories into unified internal
// categories (StatType) used by the optimizer (NBA + NFL).

import { StatType } from "./types";

/**
 * Maps a raw market/stat key from an external source (PrizePicks, Underdog,
 * SGO statID, other books) to a normalized StatType used internally by the
 * optimizer.
 *
 * - For NBA: we keep existing behavior for points/rebounds/assists/etc.
 * - For NFL: we map SGO statIDs and common aliases to the new StatType union.
 *
 * If we don't recognize the key, we return the original raw string so callers
 * can either skip it or handle it separately.
 */
export function normalizeStatType(raw: string): StatType | string {
  const key = raw.toLowerCase().trim();

  //
  // NBA: existing + extended aliases
  //
  if (["points", "pts", "player_points"].includes(key)) {
    return "points";
  }

  if (["rebounds", "rebs", "player_rebounds"].includes(key)) {
    return "rebounds";
  }

  if (["assists", "asts", "player_assists"].includes(key)) {
    return "assists";
  }

  if (["pra", "points_rebounds_assists", "player_pra"].includes(key)) {
    return "pra";
  }

  if (["points+rebounds", "points_rebounds", "pr"].includes(key)) {
    return "pr";
  }

  if (["points+assists", "points_assists", "pa"].includes(key)) {
    return "pa";
  }

  if (["rebounds+assists", "rebounds_assists", "ra"].includes(key)) {
    return "ra";
  }

  if (
    ["threes", "threepointersmade", "3pt_made", "3pm", "player_threes"].includes(
      key
    )
  ) {
    return "threes";
  }

  if (["blocks", "blk", "player_blocks"].includes(key)) {
    return "blocks";
  }

  if (["steals", "stl", "player_steals"].includes(key)) {
    return "steals";
  }

  if (["stocks", "steals+blocks", "steals_blocks"].includes(key)) {
    return "stocks";
  }

  if (["turnovers", "to", "player_turnovers"].includes(key)) {
    return "turnovers";
  }

  if (
    [
      "fantasy",
      "fantasy_score",
      "fantasy_points",
      "fantasyscore",
      "fpts",
      "player_fantasy",
    ].includes(key)
  ) {
    return "fantasy";
  }

  //
  // NFL: SGO statIDs + common aliases
  // SGO uses patterns like receiving_yards, rushing_attempts, passing_yards, etc.
  //

  // Passing yards
  if (["passing_yards", "pass_yards", "passing_yards_player"].includes(key)) {
    return "pass_yards";
  }

  // Passing attempts
  if (["passing_attempts", "pass_attempts"].includes(key)) {
    return "pass_attempts";
  }

  // Passing completions
  if (["passing_completions", "pass_completions"].includes(key)) {
    return "pass_completions";
  }

  // Passing TDs
  if (
    ["passing_touchdowns", "pass_tds", "pass_touchdowns", "passing_tds"].includes(
      key
    )
  ) {
    return "pass_tds";
  }

  // Interceptions
  if (
    [
      "passing_interceptions",
      "interceptions",
      "interceptions_thrown",
      "pass_ints",
    ].includes(key)
  ) {
    return "interceptions";
  }

  // Longest completion
  if (
    [
      "passing_longestcompletion",
      "longest_completion",
      "pass_longest_completion",
    ].includes(key)
  ) {
    return "longest_completion";
  }

  // Passer rating
  if (
    ["passing_passerrating", "passer_rating", "qb_rating", "pass_rating"].includes(
      key
    )
  ) {
    return "passer_rating";
  }

  // Rushing yards
  if (["rushing_yards", "rush_yards", "rushing_yards_player"].includes(key)) {
    return "rush_yards";
  }

  // Rushing attempts
  if (["rushing_attempts", "rush_attempts"].includes(key)) {
    return "rush_attempts";
  }

  // Rushing TDs
  if (
    ["rushing_touchdowns", "rush_tds", "rush_touchdowns", "rushing_tds"].includes(
      key
    )
  ) {
    return "rush_tds";
  }

  // Longest rush
  if (["rushing_longestrush", "longest_rush", "rush_longest_rush"].includes(key)) {
    return "longest_rush";
  }

  // Receiving yards
  if (
    ["receiving_yards", "rec_yards", "receiving_yards_player"].includes(key)
  ) {
    return "rec_yards";
  }

  // Receptions
  if (["receiving_receptions", "receptions", "rec_receptions"].includes(key)) {
    return "receptions";
  }

  // Receiving TDs
  if (
    [
      "receiving_touchdowns",
      "rec_tds",
      "rec_touchdowns",
      "receiving_tds",
    ].includes(key)
  ) {
    return "rec_tds";
  }

  // Longest reception
  if (
    [
      "receiving_longestreception",
      "longest_reception",
      "rec_longest_reception",
    ].includes(key)
  ) {
    return "longest_reception";
  }

  // Passing + rushing yards
  if (
    [
      "passing+rushing_yards",
      "pass_rush_yards",
      "pass+rush_yards",
      "passing_rushing_yards",
    ].includes(key)
  ) {
    return "pass_rush_yards";
  }

  // Rushing + receiving yards
  if (
    [
      "rushing+receiving_yards",
      "rush_rec_yards",
      "rush+rec_yards",
      "rushing_receiving_yards",
    ].includes(key)
  ) {
    return "rush_rec_yards";
  }

  // Any touchdown
  if (["touchdowns", "any_td", "player_touchdowns"].includes(key)) {
    return "any_td";
  }

  // NFL fantasy
  if (
    [
      "fantasyscore_nfl",
      "fantasy_score_nfl",
      "nfl_fantasy",
      "fantasy_nfl",
      "fantasy_points_nfl",
    ].includes(key)
  ) {
    return "nfl_fantasy";
  }

  // Fallback: return the raw key if no mapping exists yet.
  return raw;
}
