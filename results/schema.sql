-- DFS Optimizer Results Database — Training-ready schema
-- Every field is chosen to support future AI model training

CREATE TABLE IF NOT EXISTS runs (
    run_id          TEXT PRIMARY KEY,       -- UUID or timestamp-based
    started_at      TEXT NOT NULL,          -- ISO timestamp
    completed_at    TEXT,
    bankroll        REAL NOT NULL DEFAULT 600,
    odds_source     TEXT,                   -- 'SGO', 'OddsAPI', 'mixed'
    snapshot_id     TEXT,                   -- odds snapshot ID used
    snapshot_age_m  REAL,                   -- snapshot age in minutes
    pp_legs         INTEGER DEFAULT 0,
    ud_legs         INTEGER DEFAULT 0,
    pp_cards        INTEGER DEFAULT 0,
    ud_cards        INTEGER DEFAULT 0,
    sports          TEXT,                   -- comma-separated: 'NBA,NHL'
    pipeline_version TEXT                   -- git hash or version tag
);

CREATE TABLE IF NOT EXISTS cards (
    card_id         TEXT PRIMARY KEY,       -- stable hash: site-flexType-sortedLegIds
    run_id          TEXT REFERENCES runs(run_id),
    site            TEXT NOT NULL,          -- 'PP' or 'UD'
    sport           TEXT NOT NULL,          -- 'NBA', 'NHL', etc.
    flex_type       TEXT NOT NULL,          -- '6P', '6F', '8P', etc.
    card_type       TEXT,                   -- 'power', 'flex'
    leg_count       INTEGER NOT NULL,
    created_at      TEXT NOT NULL,          -- ISO timestamp from runTimestamp
    card_ev         REAL NOT NULL,
    edge_pct        REAL NOT NULL,          -- avg edge as decimal (0.08 = 8%)
    win_prob_cash   REAL,                   -- winProbCash (0–1)
    win_prob_any    REAL,                   -- winProbAny (0–1, for flex)
    avg_prob        REAL,                   -- avg leg trueProb
    kelly_raw_frac  REAL,
    kelly_final_frac REAL,
    kelly_stake     REAL NOT NULL,
    kelly_risk_adj  TEXT,                   -- 'FULL_KELLY','HALF_KELLY',etc.
    best_bet_score  REAL,
    best_bet_tier   TEXT,                   -- 'must_play','strong','small','lottery','skip'
    fragile         INTEGER DEFAULT 0,      -- 1 if fragile flag set
    correlation_adj REAL,                   -- correlation adjustment applied
    source_provider TEXT,                   -- 'SGO','OddsAPI','mixed'
    status          TEXT DEFAULT 'pending', -- 'pending','won','lost','partial','void'
    payout          REAL,
    roi             REAL,                   -- (payout - stake) / stake
    settled_at      TEXT
);

CREATE TABLE IF NOT EXISTS legs (
    leg_id          TEXT NOT NULL,          -- e.g. prizepicks-10331091-assists-4
    card_id         TEXT NOT NULL REFERENCES cards(card_id),
    leg_index       INTEGER NOT NULL,       -- 0-based position in card
    player          TEXT,
    team            TEXT,
    opponent        TEXT,
    stat_type       TEXT,                   -- 'points', 'rebounds', etc.
    line            REAL,
    side            TEXT DEFAULT 'over',    -- 'over' or 'under'
    true_prob       REAL,                   -- model probability
    edge            REAL,                   -- leg-level edge
    leg_ev          REAL,
    over_odds       REAL,                   -- american odds
    under_odds      REAL,
    book            TEXT,                   -- odds source book
    game_date       TEXT,                   -- ISO date of the game
    game_time       TEXT,                   -- ISO datetime
    is_alt_line     INTEGER DEFAULT 0,
    PRIMARY KEY (card_id, leg_id)
);

CREATE TABLE IF NOT EXISTS outcomes (
    outcome_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id         TEXT NOT NULL REFERENCES cards(card_id),
    leg_id          TEXT DEFAULT '__card__',
    result          TEXT,                   -- 'hit','miss','push','void'
    actual_stat     REAL,                   -- actual player stat value
    stake           REAL,
    payout          REAL,
    roi             REAL,
    settled_at      TEXT,
    UNIQUE(card_id, leg_id)
);

CREATE INDEX IF NOT EXISTS idx_cards_run ON cards(run_id);
CREATE INDEX IF NOT EXISTS idx_cards_site_sport ON cards(site, sport);
CREATE INDEX IF NOT EXISTS idx_cards_tier ON cards(best_bet_tier);
CREATE INDEX IF NOT EXISTS idx_cards_created ON cards(created_at);
CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status);
CREATE INDEX IF NOT EXISTS idx_legs_player ON legs(player);
CREATE INDEX IF NOT EXISTS idx_legs_stat ON legs(stat_type);
CREATE INDEX IF NOT EXISTS idx_legs_team ON legs(team);
CREATE INDEX IF NOT EXISTS idx_outcomes_result ON outcomes(result);
CREATE INDEX IF NOT EXISTS idx_outcomes_card ON outcomes(card_id);
CREATE INDEX IF NOT EXISTS idx_runs_started ON runs(started_at);
CREATE INDEX IF NOT EXISTS idx_cards_settled ON cards(settled_at);
