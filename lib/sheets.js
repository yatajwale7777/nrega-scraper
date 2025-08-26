// lib/sheets.js
require('dotenv').config();

const { google } = require('googleapis');

// ---------- Auth & Client (cached) ----------
function loadCreds() {
  const b64 = process.env.GOOGLE_CREDENTIALS_BASE64;
  if (!b64) throw new Error('Missing env GOOGLE_CREDENTIALS_BASE64');
  const json = Buffer.from(b64, 'base64').toString('utf8');
  return JSON.parse(json);
}

let _sheets = null;

async function getClient() {
  if (_sheets) return _sheets;
  const auth = new google.auth.GoogleAuth({
    credentials: loadCreds(),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  _sheets = google.sheets({ version: 'v4', auth });
  return _sheets;
}

// ---------- Utility: retry for transient errors ----------
async function requestWithRetry(fn, { tries = 5, baseMs = 500 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const code = err?.code || err?.response?.status;
      // Retry on 429 / 5xx
      if (code === 429 || (code >= 500 && code < 600)) {
        const delay = baseMs * Math.pow(2, i); // exponential backoff
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

// ---------- Sheet helpers ----------
async function ensureTabExists(spreadsheetId, tab) {
  const sheets = await getClient();
  // Check existing tabs
  const meta = await requestWithRetry(() =>
    sheets.spreadsheets.get({ spreadsheetId })
  );
  const exists = (meta.data.sheets || []).some(
    (s) => s.properties?.title === tab
  );
  if (exists) return;

  // Create the tab
  await requestWithRetry(() =>
    sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: {
        requests: [{ addSheet: { properties: { title: tab } } }],
      },
    })
  );
}

async function appendRowsTo(spreadsheetId, tab, rows) {
  const sheets = await getClient();
  await ensureTabExists(spreadsheetId, tab);
  await requestWithRetry(() =>
    sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${tab}!A:Z`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: rows },
    })
  );
}

// overwrite any A1 range
async function updateRange(spreadsheetId, rangeA1, values, valueInputOption = 'RAW') {
  const sheets = await getClient();
  // best-effort: ensure tab exists (extract tab name from rangeA1 before '!' if present)
  const tab = String(rangeA1).includes('!') ? String(rangeA1).split('!')[0] : null;
  if (tab) await ensureTabExists(spreadsheetId, tab);

  await requestWithRetry(() =>
    sheets.spreadsheets.values.update({
      spreadsheetId,
      range: rangeA1,
      valueInputOption,
      requestBody: { values },
    })
  );
}

async function readRange(spreadsheetId, a1Range) {
  const sheets = await getClient();
  return await requestWithRetry(async () => {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: a1Range,
    });
    return res.data.values || [];
  });
}

async function clearTab(spreadsheetId, tab) {
  const sheets = await getClient();
  await ensureTabExists(spreadsheetId, tab);
  await requestWithRetry(() =>
    sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${tab}!A:Z`,
    })
  );
}

// ✅ clear any A1 range (e.g., `${tab}!A4:Z`)
async function clearRange(spreadsheetId, rangeA1) {
  const sheets = await getClient();
  // ensure tab exists (if range includes tab)
  const tab = String(rangeA1).includes('!') ? String(rangeA1).split('!')[0] : null;
  if (tab) await ensureTabExists(spreadsheetId, tab);

  await requestWithRetry(() =>
    sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: rangeA1,
    })
  );
}

module.exports = {
  getClient,
  appendRowsTo,
  updateRange,
  readRange,
  clearTab,
  clearRange,
};
