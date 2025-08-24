# nrega-scraper (Render-on-demand)

## What this does
- Runs your scripts **sequentially** (one by one) in this order:
  trakingfile.cjs → A1.cjs → labour.cjs → master.cjs → link.cjs → achiv.cjs → works.cjs
- Logs results (timestamp, status, duration, note) to Google Sheet.
- Uses Render **only for a short run**, then auto-deletes the service.

## Required GitHub Secrets
- `RENDER_API_KEY` (Render account → API key)
- `GOOGLE_CREDENTIALS_BASE64` (service account JSON, base64-encoded)
- `SHEET_ID` (Google Spreadsheet ID)
- `SHEET_TAB` (e.g., "Runs")

## How to use
1. Push this repo to GitHub: `yatajwale7777/nrega-scraper`
2. Add the secrets above in GitHub → Settings → Secrets and variables → Actions.
3. Go to Actions tab → run **Render On-Demand** (manual), or wait for the **07:00 IST** schedule.
4. Check your Google Sheet in the tab you set (default "Runs") for logs.

## Local test
```bash
npm install
SHEET_ID=yourSheetId SHEET_TAB=Runs GOOGLE_CREDENTIALS_BASE64=... npm start
```

## Note
- Each script is spawned with `node` in a separate process, so if one fails, others still run.
- CI exit code is non-zero if any script fails (useful for alerts).
