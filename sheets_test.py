import os
import csv
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
SPREADSHEET_ID = "PUT_YOUR_SHEET_ID_HERE"  # from the sheet URL
TARGET_RANGE = "Legs!A1"  # tab name + top-left cell

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
        with open("token.json", "w") as token:
            token.write(creds.to_json())
    return build("sheets", "v4", credentials=creds)

def csv_to_values(path: str):
    with open(path, newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        return [row for row in reader]

if __name__ == "__main__":
    service = get_sheets_service()
    values = csv_to_values("prizepicks-legs.csv")

    body = {"values": values}

    service.spreadsheets().values().clear(
        spreadsheetId=SPREADSHEET_ID,
        range=TARGET_RANGE,
    ).execute()

    service.spreadsheets().values().update(
        spreadsheetId=SPREADSHEET_ID,
        range=TARGET_RANGE,
        valueInputOption="RAW",
        body=body,
    ).execute()

    print("Pushed legs CSV to Sheets")
