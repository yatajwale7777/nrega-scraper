// scripts/master.cjs
try { require('dotenv').config(); } catch {} // local .env; Render/Actions पर env UI/Secrets से आएँगे

const axios = require('../lib/http'); // your tuned axios client
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { updateRange /*, clearRange */ } = require('../lib/sheets'); // env-based service account

// --- load target from config/targets.json ---
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

// --- HTTP get with retries/backoff ---
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
      console.warn(`[master] HTTP failed (try ${i}/${tries}) → ${e?.message || e}. Retrying in ${backoff}ms`);
      await sleep(backoff);
    }
  }
  throw lastErr;
}

// --- table helpers ---
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

function looksLikeInfo(text) {
  const T = String(text || '').toUpperCase();
  return T.includes('DATE') || T.includes('REPORT') || T.includes('GENERATED');
}

function looksLikeMainHeader(headerRow) {
  const H = headerRow.map(x => String(x).toUpperCase()).join(' | ');
  // loose keywords — ज़रूरत हो तो extend करें
  return ['SNO', 'PANCHAYAT', 'WORK', 'MUSTER', 'LABOUR', 'JOB', 'DAYS']
    .some(k => H.includes(k));
}

function pickInfoTable($) {
  // preferred: 2nd table (index 1)
  let $t = $('table').eq(1);
  if ($t && $t.length) {
    const txt = $t.text().replace(/\s+/g, ' ').trim();
    if (txt && looksLikeInfo(txt)) return $t;
  }
  // fallback: पहली table जिसमें date/report जैसा text हो
  let chosen = null;
  $('table').each((i, el) => {
    if (chosen) return;
    const txt = $(el).text().replace(/\s+/g, ' ').trim();
    if (looksLikeInfo(txt)) chosen = $(el);
  });
  return chosen || $t;
}

function pickDataTable($) {
  // preferred: 3rd table (index 2)
  let $t = $('table').eq(2);
  let mat = $t && $t.length ? tableToMatrix($, $t) : [];
  if (mat.length >= 2 && looksLikeMainHeader(mat[0])) return $t;

  // fallback: header-based search
  let cand = null;
  $('table').each((i, el) => {
    if (cand) return;
    const m = tableToMatrix($, $(el));
    if (m.length >= 2 && looksLikeMainHeader(m[0])) cand = $(el);
  });
  return cand || $t;
}

// --- scrape ---
const NREGA_URL =
  'https://nreganarep.nic.in/netnrega/dpc_sms_new_dtl.aspx?page=d&Short_Name=MP&state_name=MADHYA+PRADESH&state_code=17&district_name=BALAGHAT&district_code=1738&block_name=KHAIRLANJI&block_code=1738002&fin_year=2025-2026&EDepartment=ALL&wrkcat=ALL&worktype=ALL&Digest=7pxWKhbxrTXuPBiiRtODgQ';

async function fetchAndScrape(url) {
  const { data: html } = await getWithRetries(url, 3);
  const $ = cheerio.load(html);

  // INFO (→ A19)
  const infoT = pickInfoTable($);
  if (!infoT || !infoT.length) throw new Error('Info table not found');
  const infoText = infoT.text().replace(/\s+/g, ' ').trim();
  const infoRow = [[infoText]];

  // DATA (→ A20..)
  const dataT = pickDataTable($);
  if (!dataT || !dataT.length) throw new Error('Data table not found');
  const dataRows = tableToMatrix($, dataT);

  return { infoRow, dataRows };
}

// --- main ---
(async () => {
  try {
    const { spreadsheetId, tab } = loadTarget('master.cjs'); // "Sheet5"

    console.log('🔧 Running master.cjs scrape...', nowISO());

    const { infoRow, dataRows } = await fetchAndScrape(NREGA_URL);
    console.log(`📋 Info→A19 cells: ${infoRow.length}x${infoRow[0]?.length || 0}`);
    console.log(`📊 Data rows: ${dataRows.length}`);

    // (Optional) पहले साफ़ करना हो तो:
    // await clearRange(spreadsheetId, `${tab}!A19:Z`);

    await updateRange(spreadsheetId, `${tab}!A19`, infoRow, 'RAW');

    if (dataRows.length > 0) {
      await updateRange(spreadsheetId, `${tab}!A20`, dataRows, 'RAW');
    } else {
      // minimal fallback (rare)
      await updateRange(spreadsheetId, `${tab}!A20`, [[nowISO(), 'No data rows found']], 'RAW');
    }

    console.log('✅ master.cjs: data written to', `${tab}!A19`, 'and', `${tab}!A20`);
    process.exit(0);
  } catch (err) {
    const msg =
      err?.response?.status
        ? `${err.response.status} ${err.response.statusText}`
        : (err?.message || String(err));
    console.error('❌ master.cjs Error:', msg);
    process.exit(1);
  }
})();
