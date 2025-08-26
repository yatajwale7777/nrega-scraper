// scripts/achiv.cjs
try { require('dotenv').config(); } catch {} // local .env; Render/Actions पर env से आएगा

const axios = require('../lib/http');                 // आपके प्रोजेक्ट का tuned axios client
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { updateRange, clearRange } = require('../lib/sheets'); // service account via env

// --- load target from config/targets.json (same as before, with clear errors) ---
function loadTarget(scriptFile) {
  const cfgPath = path.join(__dirname, '..', 'config', 'targets.json');
  if (!fs.existsSync(cfgPath)) throw new Error('Missing config/targets.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const tgt = cfg.targets?.[scriptFile];
  if (!tgt?.spreadsheetId || !tgt?.tab) {
    throw new Error(`No target mapping for ${scriptFile} in config/targets.json`);
  }
  return tgt; // { spreadsheetId, tab }
}

function nowISO() { return new Date().toISOString(); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// --- simple retry wrapper over your axios client ---
async function getWithRetries(url, tries = 3) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      return await axios.get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        },
        timeout: 60000,
        maxRedirects: 3,
        validateStatus: s => s >= 200 && s < 400
      });
    } catch (e) {
      lastErr = e;
      const backoff = 1500 * i * i; // 1.5s, 6s, 13.5s
      console.warn(`[achiv] HTTP failed (try ${i}/${tries}) → ${e?.message || e}. Retrying in ${backoff}ms`);
      await sleep(backoff);
    }
  }
  throw lastErr;
}

// --- helpers to read tables robustly ---
function tableToMatrix($, $table) {
  const rows = [];
  $table.find('tr').each((i, row) => {
    const cells = [];
    $(row).find('th, td').each((j, cell) => {
      const txt = $(cell).text().replace(/\s+/g, ' ').trim();
      cells.push(txt);
    });
    if (cells.some(v => v && v.length)) rows.push(cells);
  });
  return rows;
}

function pickDate($) {
  // सारे tables/text से date ढूँढो (multiple formats)
  const bigText = $('body').text().replace(/\s+/g, ' ');
  const patterns = [
    /\b(\d{2}-[A-Za-z]{3}-\d{4}\s+\d{2}:\d{2}:\d{2}\s+[AP]M)\b/, // 25-Aug-2025 10:05:00 AM
    /\b(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})\b/,              // 25/08/2025 10:05:00
    /\b(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\b/                  // ISO
  ];
  for (const re of patterns) {
    const m = bigText.match(re);
    if (m) return `Date: ${m[1]}`;
  }
  return `Date: ${nowISO()}`; // fallback
}

function pickMainDataTable($) {
  // 1) Heuristic by headers (loose)
  const headerExpect = ['SNO', 'PANCHAYAT', 'DEMAND', 'EMPLOY', 'JOB', 'HOUSEHOLD'];
  let best = null;
  $('table').each((i, el) => {
    const m = tableToMatrix($, $(el));
    if (m.length >= 2) {
      const headerLine = (m[0] || []).map(s => String(s).toUpperCase()).join(' | ');
      const hit = headerExpect.some(k => headerLine.includes(k));
      if (hit && (!best || m.length > best.rows.length)) {
        best = { $t: $(el), rows: m };
      }
    }
  });

  // 2) Fallback: pick the largest table by rows
  if (!best) {
    $('table').each((i, el) => {
      const m = tableToMatrix($, $(el));
      if (m.length >= 2 && (!best || m.length > best.rows.length)) {
        best = { $t: $(el), rows: m };
      }
    });
  }
  return best ? best.rows : [];
}

// NREGA URL
const NREGA_URL =
  'https://nreganarep.nic.in/netnrega/demand_emp_demand.aspx?file1=empprov&page1=b&lflag=eng&state_name=MADHYA+PRADESH&state_code=17&district_name=BALAGHAT&district_code=1738&block_code=1738002&block_name=KHAIRLANJI&fin_year=2025-2026&source=national&rbl=0&rblhpb=Both&Digest=oDzFUp3uDTVmeqEgUV5uKA';

// ---- scrape ----
async function scrapeTables() {
  console.log('🔧 Running achiv.cjs scrape...');

  const { data: html } = await getWithRetries(NREGA_URL, 3);
  const $ = cheerio.load(html);

  const dateLine = pickDate($);

  // main data table
  const dataMatrix = pickMainDataTable($);
  if (dataMatrix.length === 0) {
    console.warn('[achiv] main data table not detected; writing only date.');
  }

  const finalData = [[dateLine], ...dataMatrix];
  console.log(`📋 Extracted ${Math.max(0, finalData.length - 1)} data rows (plus date).`);
  return finalData;
}

// ---- main ----
(async () => {
  try {
    const { spreadsheetId, tab } = loadTarget('achiv.cjs'); // tab should be "achiv"
    const data = await scrapeTables();

    // 1) Clear previous data from A4:Z (keep headers above)
    await clearRange(spreadsheetId, `${tab}!A4:Z`);
    console.log('🧹 Cleared', `${tab}!A4:Z`);

    // 2) Write new data starting at A4
    if (data.length > 0) {
      await updateRange(spreadsheetId, `${tab}!A4`, data, 'RAW');
    }
    console.log('✅ Data written to', `${tab}!A4`);

    process.exit(0);
  } catch (err) {
    const msg =
      err?.response?.status
        ? `${err.response.status} ${err.response.statusText}`
        : (err?.message || String(err));
    console.error('❌ achiv.cjs Error:', msg);
    process.exit(1);
  }
})();
