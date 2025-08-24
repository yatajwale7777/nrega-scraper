/**
 * Minimal Google Sheets helper.
 * Requires env:
 *  - GOOGLE_CREDENTIALS_BASE64 (service account JSON, base64-encoded)
 *  - SHEET_ID (target spreadsheet id)
 * Optional:
 *  - SHEET_TAB (tab name, default: 'Runs')
 */
const { google } = require('googleapis');

function loadCreds() {
  const b64 = process.env.GOOGLE_CREDENTIALS_BASE64;
  if (!b64) throw new Error("Missing env GOOGLE_CREDENTIALS_BASE64");
  const json = Buffer.from(b64, 'base64').toString('utf8');
  return JSON.parse(json);
}

async function makeClient() {
  const creds = loadCreds();
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const sheets = google.sheets({ version: 'v4', auth });
  return sheets;
}

async function appendRows(rows) {
  const SHEET_ID = process.env.SHEET_ID;
  const SHEET_TAB = process.env.SHEET_TAB || 'Runs';
  if (!SHEET_ID) throw new Error("Missing env SHEET_ID");
  const sheets = await makeClient();
  const range = `${SHEET_TAB}!A:Z`;
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows }
  });
}

module.exports = { appendRows };
