# Google Sheets authorization

The legs/cards push scripts (`sheets_push_legs.py`, `sheets_push_cards.py`, `sheets_push_underdog_legs.py`) use **OAuth 2.0** so you sign in with your Google account and grant access to the spreadsheet.

**If you have "View only" access:** The sheet owner must add your Google account as **Editor** (Share → add your email → set role to Editor). See [SHEETS_SETUP.md](SHEETS_SETUP.md) for details and for fixing the header row so data isn’t off by one column.

## 1. Create OAuth credentials (one-time)

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project.
3. **Enable the API**: APIs & Services → Library → search **Google Sheets API** → Enable.
4. **Create OAuth client**:
   - APIs & Services → **Credentials** → **Create credentials** → **OAuth client ID**.
   - If asked, configure the **OAuth consent screen** (External, add your email as test user).
   - Application type: **Desktop app**.
   - Name it (e.g. “NBA Optimizer”) → Create.
5. **Download the client config**: click the new OAuth 2.0 Client ID → **Download JSON**.
6. Save the file as **`credentials.json`** in the **project root** (same folder as `sheets_push_legs.py`).

## 2. First run (browser sign-in)

From the project root:

```bash
python sheets_push_legs.py
```

- A browser window opens asking you to sign in with Google and allow access to Google Sheets.
- After you allow, the script creates **`token.json`** in the project root and uses it for future runs.

After that, `sheets_push_legs.py` and `sheets_push_cards.py` will use `token.json` and only open the browser again when the token expires or is removed.

## 3. Keep secrets out of git

Add to `.gitignore`:

```
credentials.json
token.json
```

Never commit these files.

## 4. Optional: use a service account

If you prefer not to use the browser (e.g. on a server), you can use a **service account**:

1. In Google Cloud Console: Credentials → Create credentials → **Service account**.
2. Create the key (JSON) and save it (e.g. `config/local-sa.json`).
3. Share your Google Sheet with the service account **email** (e.g. `xxx@yyy.iam.gserviceaccount.com`) as Editor.
4. Set the env var before running the push scripts:

   ```bash
   set GOOGLE_APPLICATION_CREDENTIALS=config\local-sa.json
   python sheets_push_legs.py
   ```

The current push scripts are written for OAuth (`credentials.json` + `token.json`). To use a service account with them you’d need to switch the Python code to use `google.oauth2.service_account.Credentials` and that JSON key instead of the OAuth flow.

## Summary

| Step | What you need |
|------|----------------|
| One-time setup | `credentials.json` from Cloud Console (Desktop OAuth client). |
| First run | Run any push script → sign in in browser → `token.json` is created. |
| Later runs | Scripts use `token.json`; no browser unless token is expired or deleted. |
