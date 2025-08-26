// scripts/A1.cjs
try { require('dotenv').config(); } catch {} // local .env; Render/Actions पर env UI/Secrets से आएगा

// ---- harden errors (prints real stacktraces) ----
process.on('unhandledRejection', e => {
  console.error('[unhandledRejection]', (e && e.stack) || e);
  process.exitCode = 1;
});
process.on('uncaughtException', e => {
  console.error('[uncaughtException]', (e && e.stack) || e);
  process.exit(1);
});

const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const dns = require('dns');
const http = require('http');
const https = require('https');
const axiosBase = require('axios');
const { updateRange /* , clearRange */ } = require('../lib/sheets'); // uses service account via env

// ---------- axios client (IPv4 + keep-alive) ----------
const agentHttp = new http.Agent({ keepAlive: true, maxSockets: 10 });
const agentHttps = new https.Agent({ keepAlive: true, maxSockets: 10 });
function v4lookup(hostname, opts, cb) {
  return dns.lookup(hostname, { family: 4 }, cb);
}
const axios = axiosBase.create({
  timeout: 60000,
  maxRedirects: 3,
  httpAgent: agentHttp,
  httpsAgent: agentHttps,
  // follow-redirects compatible
  // @ts-ignore
  lookup: v4lookup,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  },
  validateStatus: s => s >= 200 && s < 400
});

function nowISO() { return new Date().toISOString(); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---------- config loader (with env fallback) ----------
function loadTarget(scriptFile) {
  try {
    const cfgPath = path.join(__dirname, '..', 'config', 'targets.json');
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      const tgt = cfg.targets?.[scriptFile];
      if (tgt?.spreadsheetId && tgt?.tab) return tgt;
      throw new Error(`No target mapping for ${scriptFile} in config/targets.json`);
    }
    throw new Error('Missing config/targets.json');
  } catch (e) {
    const spreadsheetId = process.env.A1_SHEET_ID || process.env.SHEET_ID || '';
    const tab = process.env.A1_TAB || 'R1.1';
    if (!spreadsheetId) {
      console.warn('[A1] config/targets.json not found; using env fallback (A1_SHEET_ID / SHEET_ID).');
      throw new Error('No spreadsheetId found in config or env (A1_SHEET_ID/SHEET_ID).');
    }
    return { spreadsheetId, tab };
  }
}

// ---------- HTTP fetch with retries ----------
async function getWithRetries(url, tries = 3) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      return await axios.get(url);
    } catch (err) {
      lastErr = err;
      const wait = 1500 * i * i; // 1.5s, 6s, 13.5s
      console.warn(`[A1] request failed (try ${i}/${tries}) → ${err?.message || err}. Retrying in ${wait}ms`);
      await sleep(wait);
    }
  }
  throw lastErr;
}

// ---------- table helpers ----------
function tableToMatrix($, $table) {
  const rows = [];
  $table.find('tr').each((i, row) => {
    const cells = [];
    $(row).find('th, td').each((j, cell) => {
      const text = $(cell).text().replace(/\s+/g, ' ').trim();
      cells.push(text);
    });
    if (cells.some(v => v && v.length)) rows.push(cells);
  });
  return rows;
}

function hasHeaders(row, patterns) {
  const line = row.map(v => String(v).toUpperCase()).join(' | ');
  return patterns.every(p => line.includes(String(p).toUpperCase()));
}

// ---- locate table2 (info) & table7 (data) robustly ----
function pickInfoTable($) {
  let $t = $('table').eq(1);
  if ($t && $t.length && tableToMatrix($, $t).length) return $t;

  let chosen = null;
  $('table').each((i, el) => {
    if (chosen) return;
    const txt = $(el).text().replace(/\s+/g, ' ').trim().toUpperCase();
    if (txt.includes('DATE') || txt.includes('REPORT')) chosen = $(el);
  });
  return chosen || $t;
}

function pickDataTable($) {
  let $t = $('table').eq(6);
  let mat = $t && $t.length ? tableToMatrix($, $t) : [];
  if (mat.length >= 2) return $t;

  const headerExpect = ['SNO', 'PANCHAYAT', 'WORK', 'LABOUR']; // loose match
  let candidate = null;
  $('table').each((i, el) => {
    if (candidate) return;
    const m = tableToMatrix($, $(el));
    if (m.length >= 2 && hasHeaders(m[0], headerExpect)) {
      candidate = $(el);
    }
  });
  return candidate || $t;
}

// ---- scrape ----
async function fetchAndScrape(url) {
  const response = await getWithRetries(url, 3);
  const $ = cheerio.load(response.data);

  const infoTable = pickInfoTable($);
  if (!infoTable || !infoTable.length) throw new Error('Info table not found');
  const infoText = infoTable.text().replace(/\s+/g, ' ').trim();
  const infoRow = [[infoText]]; // A3 में एक cell

  const dataTable = pickDataTable($);
  if (!dataTable || !dataTable.length) throw new Error('Data table not found');
  let dataRows = tableToMatrix($, dataTable);

  // OPTIONAL: 'Total' last row skip
  // const last = dataRows[dataRows.length - 1] || [];
  // if (last.join(' ').toUpperCase().includes('TOTAL')) dataRows = dataRows.slice(0, -1);

  return { infoRow, dataRows };
}

// ---- main ----
(async () => {
  const { spreadsheetId, tab } = loadTarget('A1.cjs'); // default "R1.1" via env if config missing

  const url =
    'https://nreganarep.nic.in/netnrega/app_issue.aspx?page=b&lflag=&state_name=MADHYA+PRADESH&state_code=17&district_name=BALAGHAT&district_code=1738&block_code=1738002&block_name=KHAIRLANJI&fin_year=2025-2026&source=national&Digest=AS/EzXOjY5nZjEFgC7kuSQ';

  console.log('🔧 Running A1.cjs scrape...', nowISO());

  try {
    const { infoRow, dataRows } = await fetchAndScrape(url);
    console.log(`📋 Info cells: ${infoRow.length}x${infoRow[0]?.length || 0}`);
    console.log(`📊 Data rows: ${dataRows.length}`);

    // Write info (A3)
    await updateRange(spreadsheetId, `${tab}!A3`, infoRow, 'RAW');

    // OPTIONAL clear: uncomment to prevent leftovers
    // await clearRange(spreadsheetId, `${tab}!A4:Z10000`);

    // Write data (A4..)
    if (dataRows.length > 0) {
      await updateRange(spreadsheetId, `${tab}!A4`, dataRows, 'RAW');
    }

    console.log('✅ A1.cjs: data written to', `${tab}!A3`, 'and', `${tab}!A4`);
    process.exit(0);
  } catch (err) {
    const msg =
      err?.response?.status
        ? `${err.response.status} ${err.response.statusText}`
        : (err?.message || String(err));
    console.error('❌ A1.cjs Error:', msg);
    process.exit(1);
  }
})();
