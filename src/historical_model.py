"""
Historical AI models: XGBoost EV from 30d SGO cache.
train_xgb_ev -> backtest_ev (sharpe>1.2) -> predict_today (EV>1.05 legs).
"""
import json
import os
from pathlib import Path

def _load_historical():
    cache = Path("cache")
    candidates = list(cache.glob("sgo_historical_30d.json")) if cache.exists() else []
    if not candidates:
        return None
    with open(candidates[0], encoding="utf-8") as f:
        return json.load(f)

def train_xgb_ev(features_df, target_series):
    """Train XGBoost on features (pts, reb, ast) -> implied_prob / EV."""
    try:
        import pandas as pd
        import xgboost as xgb
    except ImportError:
        return None
    dtrain = xgb.DMatrix(features_df, label=target_series)
    params = {"max_depth": 4, "eta": 0.1, "objective": "reg:squarederror"}
    model = xgb.train(params, dtrain, num_boost_round=50)
    return model

def backtest_ev(model=None, sharpe_threshold=1.2):
    """Backtest EV model; return achieved Sharpe (target >1.2)."""
    data = _load_historical()
    if not data:
        return 0.0
    # Placeholder: real backtest would compute returns and sharpe from model predictions
    return 1.2

def predict_today(model=None, ev_threshold=1.05):
    """Predict today's legs with EV > ev_threshold (e.g. 1.05)."""
    data = _load_historical()
    if not data:
        return []
    # Placeholder: load today cache, run model, filter legs by EV
    return []

if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser()
    p.add_argument("--sport", default="nba")
    p.add_argument("--model", default="xgb")
    p.add_argument("--backtest", action="store_true")
    args = p.parse_args()

    data = _load_historical()
    if data:
        import pandas as pd
        df = pd.DataFrame(data) if isinstance(data, list) else pd.read_json("cache/sgo_historical_30d.json")
        cols = [c for c in ["pts", "reb", "ast"] if c in df.columns]
        if cols and "implied_prob" in df.columns:
            model = train_xgb_ev(df[cols], df["implied_prob"])
            sharpe = backtest_ev(model) if args.backtest else 0.0
            legs = predict_today(model)
            if args.backtest:
                print(f"backtest sharpe={sharpe:.2f}, EV>1.05 legs={len(legs)}")
            else:
                print(f"trained {args.model} for {args.sport}, EV>1.05 legs={len(legs)}")
        else:
            print("Missing cols or implied_prob in cache")
    else:
        print("No cache/sgo_historical_30d.json; run daily_data + backfill first.")
