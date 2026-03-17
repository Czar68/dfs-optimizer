"""
LSTM EV model: train on sgo_historical_30d.json, target sharpe > 1.2.
Used for sportsbook multi-book EV (can be run from nba-props-optimizer with shared cache).
"""
import argparse
import json
from pathlib import Path

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--data", default="cache/sgo_historical_30d.json")
    p.add_argument("--sharpe", type=float, default=1.2)
    args = p.parse_args()
    path = Path(args.data)
    if not path.exists():
        print(f"Data not found: {args.data}")
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    # Placeholder: LSTM training on historical odds -> EV predictions, backtest sharpe
    print(f"LSTM EV: loaded {len(data) if isinstance(data, list) else 'obj'} rows, target sharpe={args.sharpe}")

if __name__ == "__main__":
    main()
