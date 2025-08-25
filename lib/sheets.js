// lib/sheets.js
const { google } = require('googleapis');

function loadCreds() {
  const b64 = process.env.GOOGLE_CREDENTIALS_BASE64;
  if (!b64) throw new Error("Missing env GOOGLE_CREDENTIALS_BASE64");
  const json = Buffer.from(b64, 'base64').toString('utf8');
  return JSON.parse(json);
}

async function getClient() {
  const auth = new google.auth.GoogleAuth({
    credentials: loadCreds(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  return google.sheets({ version: 'v4', auth });
}

async function appendRowsTo(spreadsheetId, tab, rows) {
  const sheets = await getClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${tab}!A:Z`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: rows }
  });
}

// ✅ नया helper: किसी भी A1 range पर update (overwrite)
async function updateRange(spreadsheetId, rangeA1, values, valueInputOption = 'RAW') {
  const sheets = await getClient();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: rangeA1,
    valueInputOption,
    requestBody: { values }
  });
}

async function readRange(spreadsheetId, a1Range) {
  const sheets = await getClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: a1Range
  });
  return res.data.values || [];
}

async function clearTab(spreadsheetId, tab) {
  const sheets = await getClient();
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: `${tab}!A:Z`
  });
}

module.exports = { appendRowsTo, updateRange, readRange, clearTab };
