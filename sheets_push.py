"""Google Sheets Pusher for DFS Optimizer.

Reads CSV output and pushes to configured Google Sheet.
Requires: config/props-pipeline-engine-sa.json for service account auth.
"""
from __future__ import annotations

import os
import sys
import csv
from pathlib import Path
from typing import Optional

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

SAFE_MODE = os.getenv('SAFE_MODE', 'false').lower() == 'true'
SPREADSHEET_ID = os.getenv('SPREADSHEET_ID', '')
SHEET_RANGE = os.getenv('SHEET_RANGE', 'Sheet1!A1')


def read_csv_data(filepath: str) -> list[list[str]]:
    """Read CSV file and return as list of rows."""
    if not os.path.exists(filepath):
        print(f'[WARN] CSV file not found: {filepath}')
        return []
    with open(filepath, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        return [row for row in reader]


def get_sheets_service():
    """Initialize Google Sheets API service."""
    try:
        from google.oauth2 import service_account
        from googleapiclient.discovery import build

        sa_path = Path('config/props-pipeline-engine-sa.json')
        if not sa_path.exists():
            print('[WARN] Service account key not found, skipping sheets push')
            return None

        creds = service_account.Credentials.from_service_account_file(
            str(sa_path),
            scopes=['https://www.googleapis.com/auth/spreadsheets'],
        )
        return build('sheets', 'v4', credentials=creds)
    except ImportError:
        print('[WARN] google-api-python-client not installed, skipping sheets push')
        return None
    except Exception as e:
        print(f'[ERROR] Failed to initialize Sheets service: {e}')
        return None


def push_to_sheets(
    data: list[list[str]],
    sheet_range: str = SHEET_RANGE,
    spreadsheet_id: Optional[str] = None,
) -> bool:
    """Push data to Google Sheets."""
    sid = spreadsheet_id or SPREADSHEET_ID

    if SAFE_MODE:
        print('[SAFE_MODE] Skipping Google Sheets push')
        print(f'[SAFE_MODE] Would push {len(data)} rows to {sheet_range}')
        return True

    if not sid:
        print('[WARN] SPREADSHEET_ID not set, skipping sheets push')
        return False

    service = get_sheets_service()
    if not service:
        return False

    try:
        body = {'values': data}
        service.spreadsheets().values().update(
            spreadsheetId=sid,
            range=sheet_range,
            valueInputOption='RAW',
            body=body,
        ).execute()
        print(f'[OK] Pushed {len(data)} rows to Google Sheets')
        return True
    except Exception as e:
        print(f'[ERROR] Sheets push failed: {e}')
        return False


def main() -> None:
    """Main entry: read all *_cards.csv and push to sheets."""
    csv_files = sorted(Path('.').glob('*_cards.csv'))
    if not csv_files:
        print('[WARN] No CSV files found to push')
        return

    all_data: list[list[str]] = []
    for csv_file in csv_files:
        print(f'[INFO] Reading {csv_file}')
        rows = read_csv_data(str(csv_file))
        if rows:
            if not all_data:
                all_data.extend(rows)
            else:
                all_data.extend(rows[1:])

    print(f'[INFO] Total rows: {len(all_data)}')
    success = push_to_sheets(all_data)
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
