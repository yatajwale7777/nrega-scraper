// scripts/labour.cjs
try { require('dotenv').config(); } catch {} // local .env; Render/Actions पर env UI/Secrets से आएँगे

const axios = require('../lib/http');                 // tuned axios client
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

// --- HTTP get with retries/backoff (uses your axios client) ---
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
      console.warn(`[labour] HTTP failed (try ${i}/${tries}) → ${e?.message || e}. Retrying in ${backoff}ms`);
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

function looksLikeLabourHeader(headerRow) {
  // loose match — adjust/extend keywords as needed
  const H = headerRow.map(x => String(x).toUpperCase()).join(' | ');
  const mustHaveAny = [
    'SNO', 'GRAM', 'PANCHAYAT', 'WORK', 'MUSTER', 'DEMAND',
    'LABOUR', 'EMPLOY', 'JOB', 'DAYS', 'COMPLETED', 'PENDING'
  ];
  return mustHaveAny.some(k => H.includes(k));
}

// pick candidate tables by headers; fallback to fixed indices (1,4)
function pickLabourTables($) {
  const candidates = [];
  $('table').each((i, el) => {
    const m = tableToMatrix($, $(el));
    if (m.length >= 2 && looksLikeLabourHeader(m[0])) {
      candidates.push(m);
    }
  });

  if (candidates.length) return candidates;

  // fallback जैसा पहले था (2nd और 5th)
  const t1 = $('table').eq(1);
  const t2 = $('table').eq(4);
  const m1 = t1 && t1.length ? tableToMatrix($, t1) : [];
  const m2 = t2 && t2.length ? tableToMatrix($, t2) : [];
  const out = [];
  if (m1.length) out.push(m1);
  if (m2.length) out.push(m2);
  return out;
}

// --- scrape main ---
const NREGA_URL =
  'https://nreganarep.nic.in/netnrega/dpc_sms_new.aspx?lflag=eng&page=b&Short_Name=MP&state_name=MADHYA+PRADESH&state_code=17&district_name=BALAGHAT&district_code=1738&block_name=KHAIRLANJI&block_code=1738002&fin_year=2025-2026&dt=&EDepartment=ALL&wrkcat=ALL&worktype=ALL&Digest=0Rg9WmyQmiHlGt6U8z1w4A';

async function scrapeTables() {
  console.log('🔧 Running labour.cjs scrape...');

  const { data: html } = await getWithRetries(NREGA_URL, 3);
  const $ = cheerio.load(html);

  const matrices = pickLabourTables($); // array of table matrices
  if (matrices.length === 0) {
    console.warn('[labour] No labour-looking tables found; will write timestamp note.');
    return [];
  }

  // अगर दो tables हैं और दोनों में header अलग हो सकते हैं:
  // strategy: पहली table का header रखें; बाकी tables से data rows append करें।
  const final = [];
  let header = null;
  for (const mat of matrices) {
    if (mat.length === 0) continue;
    if (!header) {
      header = mat[0];
      final.push(header);
      if (mat.length > 1) final.push(...mat.slice(1));
    } else {
      // अगर new header बहुत similar है तो skip first row
      const h2 = mat[0].join('|').toUpperCase();
      const h1 = header.join('|').toUpperCase();
      if (h2.includes('SNO') || h2 === h1) {
        final.push(...mat.slice(1));
      } else {
        // अलग header है, तो separator डालना चाहें तो डालें; फिलहाल direct append
        final.push(...mat);
      }
    }
  }

  console.log(`📋 Extracted ${final.length} rows (including header).`);
  return final;
}


(async () => {
  try {
    const { spreadsheetId, tab } = loadTarget('labour.cjs'); // "R6.09"
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
    const msg =
      err?.response?.status
        ? `${err.response.status} ${err.response.statusText}`
        : (err?.message || String(err));
    console.error('❌ labour.cjs Error:', msg);
    process.exit(1);
  }
})();
