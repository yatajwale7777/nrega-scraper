// scripts/labour.cjs
const axios = require('../lib/http');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { updateRange /*, clearRange*/ } = require('../lib/sheets'); // env-based service account

// --- load target from config/targets.json ---
function loadTarget(scriptFile) {
  const cfgPath = path.join(__dirname, '..', 'config', 'targets.json');
  if (!fs.existsSync(cfgPath)) throw new Error("Missing config/targets.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const tgt = cfg.targets?.[scriptFile];
  if (!tgt) throw new Error(`No target mapping for ${scriptFile} in config/targets.json`);
  // expected: { spreadsheetId: "...", tab: "R6.09" }
  return tgt;
}

function nowISO() { return new Date().toISOString(); }

// NREGA URL (same as your original)
const NREGA_URL = 'https://nreganarep.nic.in/netnrega/dpc_sms_new.aspx?lflag=eng&page=b&Short_Name=MP&state_name=MADHYA+PRADESH&state_code=17&district_name=BALAGHAT&district_code=1738&block_name=KHAIRLANJI&block_code=1738002&fin_year=2025-2026&dt=&EDepartment=ALL&wrkcat=ALL&worktype=ALL&Digest=0Rg9WmyQmiHlGt6U8z1w4A';

// ---- scrape helpers ----
async function scrapeTables() {
  console.log('🔧 Running labour.cjs scrape...');

  const { data: html } = await axios.get(NREGA_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 60000
  });
  const $ = cheerio.load(html);

  const tables = $('table');
  const selectedIndexes = [1, 4]; // 2nd and 5th tables
  const finalData = [];

  selectedIndexes.forEach(index => {
    const table = tables.eq(index);
    table.find('tr').each((_, row) => {
      const rowData = [];
      $(row).find('th, td').each((_, cell) => {
        const txt = $(cell).text().replace(/\s+/g, ' ').trim();
        rowData.push(txt);
      });
      if (rowData.length > 0) finalData.push(rowData);
    });
  });

  console.log(`📋 Extracted ${finalData.length} rows (including headers).`);
  return finalData;
}

// ---- main ----
(async () => {
  try {
    const { spreadsheetId, tab } = loadTarget('labour.cjs'); // tab should be "R6.09"
    const rangeStart = `${tab}!A3`; // keep same as your original

    const data = await scrapeTables();

    // (Optional) पहले साफ़ करना हो तो uncomment करें:
    // await clearRange(spreadsheetId, `${tab}!A3:Z`);

    // Overwrite from A3
    if (data.length > 0) {
      await updateRange(spreadsheetId, rangeStart, data, 'RAW');
    } else {
      // अगर data empty आ जाए तो कम-से-कम timestamp लिख दें
      await updateRange(spreadsheetId, rangeStart, [[nowISO(), 'No rows scraped']], 'RAW');
    }

    console.log('✅ labour.cjs: data written to', rangeStart);
    process.exit(0);
  } catch (err) {
    console.error('❌ labour.cjs Error:', err?.message || err);
    process.exit(1);
  }
})();

