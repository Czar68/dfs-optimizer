#!/usr/bin/env python3
import os
import subprocess
from datetime import datetime

LOG_PATH = os.path.join(os.path.dirname(__file__), "cron.log")

def log(msg: str) -> None:
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(f"{datetime.now().isoformat(timespec='seconds')} {msg}\n")

def run(cmd: list[str]) -> int:
    log(f"RUN: {' '.join(cmd)}")
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    log(proc.stdout)
    return proc.returncode

def main() -> None:
    os.chdir(os.path.dirname(__file__))

    log("START: DFS cron (npm generate + your 5 sheets_push scripts)")

    # 1) Generate cards/CSVs ($600 bankroll, Decline EV)
    rc = run(["npm", "run", "generate:production"])
    if rc != 0:
        log(f"ERROR: npm failed {rc}")
        return

    # 2) Your exact sheets_push files (3/1 + 1/25 timestamps)
    run(["python3", "sheets_push_legs.py"])           # PP legs (3/1 6:18PM 16KB)
    run(["python3", "sheets_push_cards.py"])          # PP cards (3/1 8:40AM 5KB)
    run(["python3", "sheets_push_underdog_legs.py"])  # UD legs (3/1 12:13AM 3KB)
    run(["python3", "sheets_push_underdog_cards.py"]) # UD cards (1/25 2KB) 

    log("SUCCESS: Full pipeline - PP+UD legs/cards → Sheets")

if __name__ == "__main__":
    main()
