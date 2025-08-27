// scripts/labour.cjs
const axios = require('../lib/http');
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
  if (!tgt) throw new Error(`No target mapping for ${scriptFile} in config/targets.json`);
  // expected: { spreadsheetId: "...", tab: "R6.09" }
  return tgt;
}

function nowISO() { return new Date().toISOString(); }

// ---------- resilient HTTP ----------
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function getWithRetries(url, tries = 5) {
  // backoff: 1.5s, 3s, 4.5s, 6s, 9s
  const waits = [1500, 3000, 4500, 6000, 9000];
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      return await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        },
        timeout: 60000,
        maxRedirects: 3,
        // accept 2xx-3xx
        validateStatus: (s) => s >= 200 && s < 400
      });
    } catch (err) {
      lastErr = err;
      if (i < tries) {
        const wait = waits[i - 1] || 9000;
        console.warn(`[labour] try ${i}/${tries} failed → ${err?.message}. retry in ${wait}ms`);
        await sleep(wait);
      }
    }
  }
  throw lastErr;
}

// NREGA URL (same as your original)
const NREGA_URL = 'https://nreganarep.nic.in/netnrega/dpc_sms_new.aspx?lflag=eng&page=b&Short_Name=MP&state_name=MADHYA+PRADESH&state_code=17&district_name=BALAGHAT&district_code=1738&block_name=KHAIRLANJI&block_code=1738002&fin_year=2025-2026&dt=&EDepartment=ALL&wrkcat=ALL&worktype=ALL&Digest=0Rg9WmyQmiHlGt6U8z1w4A';

// ---- scrape helpers ----
function tableToMatrix($, $table) {
  const rows = [];
  $table.find('tr').each((_, row) => {
    const rowData = [];
    $(row).find('th, td').each((__, cell) => {
      const txt = $(cell).text().replace(/\s+/g, ' ').trim();
      rowData.push(txt);
    });
    if (rowData.some(v => v && v.length)) rows.push(rowData);
  });
  return rows;
}

async function scrapeTables() {
  console.log('🔧 Running labour.cjs scrape...');
  const { data: html } = await getWithRetries(NREGA_URL, 5);
  const $ = cheerio.load(html);

  const tables = $('table');
  // Your original selection: 2nd (index 1) and 5th (index 4)
  const selectedIndexes = [1, 4];
  const finalData = [];

  selectedIndexes.forEach(idx => {
    const mat = tableToMatrix($, tables.eq(idx));
    mat.forEach(r => finalData.push(r));
  });

  console.log(`📋 Extracted ${finalData.length} rows (including headers).`);
  return finalData;
}

// ---- main ----
(async () => {
  try {
    const { spreadsheetId, tab } = loadTarget('labour.cjs'); // tab should be "R6.09"
    const rangeStart = `${tab}!A3`;

    const data = await scrapeTables();

    // (Optional) पहले साफ़ करना हो तो uncomment करें:
    // await clearRange(spreadsheetId, `${tab}!A3:Z`);

    if (data.length > 0) {
      await updateRange(spreadsheetId, rangeStart, data, 'RAW');
    } else {
      await updateRange(spreadsheetId, rangeStart, [[nowISO(), 'No rows scraped']], 'RAW');
    }

    console.log('✅ labour.cjs: data written to', rangeStart);
    process.exit(0);
  } catch (err) {
    console.error('❌ labour.cjs Error:', err?.message || err);
    process.exit(1);
  }
})();