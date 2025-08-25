// lib/sheets.js
const { google } = require('googleapis');

function loadCreds() {
  const b64 = process.env.GOOGLE_CREDENTIALS_BASE64;
  if (!b64) throw new Error("Missing env GOOGLE_CREDENTIALS_BASE64");
  const json = Buffer.from(b64, 'base64').toString('utf8');
  return JSON.parse(json);
}

async function client() {
  const auth = new google.auth.GoogleAuth({
    credentials: loadCreds(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return google.sheets({ version: 'v4', auth });
}

// Generic append to any spreadsheet/tab
async function appendRowsTo(spreadsheetId, tab, rows) {
  const sheets = await client();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tab}!A:Z`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows }
  });
}

module.exports = { appendRowsTo };
