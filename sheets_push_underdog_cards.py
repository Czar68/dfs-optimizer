# sheets_push_underdog_cards.py (UD CARDS – simple legsSummary version)

import os
import csv

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

SPREADSHEET_ID = "193mGmiA_T3VFV8PO_wYMcFd4W-CLWLAdspNeSJ6Gllo"

TARGET_RANGE = "UD-Cards!A2"  # keep row 1 for headers/formulas

CSV_PATH = "underdog-cards.csv"

# Columns we expect in the CSV header (from run_underdog_optimizer.ts)
CSV_HEADER_FIELDS = [
    "format",
    "cardEv",
    "winProbCash",
    "winProbAny",
    "legsSummary",
    "runTimestamp",
]


def get_sheets_service():
    creds = None

    if os.path.exists("token.json"):
        creds = Credentials.from_authorized_user_file("token.json", SCOPES)

    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(
                "credentials.json", SCOPES
            )
            creds = flow.run_local_server(port=0)

        with open("token.json", "w", encoding="utf-8") as token:
            token.write(creds.to_json())

    return build("sheets", "v4", credentials=creds)


def csv_to_values_split_and_reorder(path: str):
    """
    Read underdog-cards.csv and output:

    A: format
    B: cardEv
    C: winProbCash
    D: winProbAny
    E: legsSummary
    F: runTimestamp
    """
    rows = []

    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        try:
            header = next(reader)
        except StopIteration:
            return rows

        idx = {name: header.index(name) for name in CSV_HEADER_FIELDS}

        for row in reader:
            out_row = [row[idx[name]] for name in CSV_HEADER_FIELDS]
            rows.append(out_row)

    return rows


def main():
    if not os.path.exists(CSV_PATH):
        raise FileNotFoundError(f"CSV not found: {CSV_PATH}")

    service = get_sheets_service()
    values = csv_to_values_split_and_reorder(CSV_PATH)

    body = {"values": values}

    # Clear the whole UD-Cards area before pushing new rows
    service.spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID,
        range="UD-Cards!A2:F",
    ).execute()

    if values:
        service.spreadsheets().values().update(
            spreadsheetId=SPREADSHEET_ID,
            range=TARGET_RANGE,
            valueInputOption="RAW",
            body=body,
        ).execute()

    print(f"Pushed {len(values)} data rows from {CSV_PATH} to {TARGET_RANGE}")


if __name__ == "__main__":
    main()
