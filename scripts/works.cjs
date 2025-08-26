// scripts/works.cjs
// test update 2025-08-26 (hardened)

const { readRange, updateRange, clearRange } = require('../lib/sheets');
const axios = require('../lib/http');        // has timeout + light retries
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// --- load target from config/targets.json ---
function loadTarget(scriptFile) {
  const cfgPath = path.join(__dirname, '..', 'config', 'targets.json');
  if (!fs.existsSync(cfgPath)) throw new Error('Missing config/targets.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const tgt = cfg.targets?.[scriptFile];
  if (!tgt?.spreadsheetId) throw new Error(`No target mapping for ${scriptFile} in config/targets.json`);
  // expected: { spreadsheetId, readTab: "Sheet3", writeTab: "Sheet5" }
  return tgt;
}

const nowISO = () => new Date().toISOString();

// ---- read URLs from readTab!B3:B ----
async function getUrlsFromSheet(spreadsheetId, readTab) {
  const vals = await readRange(spreadsheetId, `${readTab}!B3:B`);
  const flat = (vals || []).flat().map(s => String(s || '').trim()).filter(Boolean);
  // de-dup + only http(s)
  const uniq = Array.from(new Set(flat)).filter(u => /^https?:\/\//i.test(u));
  return uniq;
}

// ---- fetch table data from a URL ----
async function fetchTableData(url) {
  try {
    const { data: html } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 60000
    });

    const $ = cheerio.load(html);
    const $tables = $('table');
    if ($tables.length < 4) {
      console.warn(`[works] ${url} → not enough tables (${ $tables.length })`);
      return [];
    }

    // --- Meta from table index 2 ---
    // The meta table usually has DISTRICT/BLOCK/PANCHAYAT text
    const metaText = $tables.eq(2).text().replace(/\s+/g, ' ').trim();
    const pick = (rx) => {
      const m = metaText.match(rx);
      return m ? m[1].trim() : null;
    };

    const state = 'MADHYA PRADESH';
    const district = pick(/DISTRICT\s*:?\s*([A-Z0-9\-\/\(\)\s]+)/i);
    const block = pick(/BLOCK\s*:?\s*([A-Z0-9\-\/\(\)\s]+)/i);
    const panchayat = pick(/PANCHAYAT\s*:?\s*([A-Z0-9\-\/\(\)\s]+)/i);
    const finYear = (url.match(/fin_year=([\d\-]+)/i) || [null, 'UNKNOWN'])[1];

    // --- Data from table index 3 ---
    // Your earlier logic: skip first 3 rows, and skip last (total) row
    const $data = $tables.eq(3);
    const trs = $data.find('tr');
    if (!trs.length) {
      console.warn(`[works] ${url} → data table empty`);
      return [];
    }

    const rows = [];
    trs.slice(3, -1).each((_, row) => {
      const cells = [];
      $(row).find('td, th').each((__, cell) => {
        const txt = $(cell).text().replace(/\s+/g, ' ').trim();
        cells.push(txt);
      });
      if (cells.length && cells.some(v => v)) {
        rows.push([state, district, block, panchayat, finYear, ...cells]);
      }
    });

    return rows;
  } catch (err) {
    console.error(`❌ [works] fetch failed ${url}:`, err?.message || err);
    return [];
  }
}

(async () => {
  try {
    const { spreadsheetId, readTab, writeTab } = loadTarget('works.cjs');
    const srcTab = readTab || 'Sheet3';
    const outTab = writeTab || 'Sheet5';

    // headers once (row 2)
    await updateRange(
      spreadsheetId,
      `${outTab}!C2`,
      [["STATE", "DISTRICT", "BLOCK", "PANCHAYAT", "FIN YEAR"]],
      "RAW"
    );

    // clear old data area
    await clearRange(spreadsheetId, `${outTab}!C3:Z`);
    console.log(`[works] cleared ${outTab}!C3:Z`);

    // read URLs
    const urls = await getUrlsFromSheet(spreadsheetId, srcTab);
    console.log(`[works] found ${urls.length} URL(s) in ${srcTab}!B3:B`);
    if (!urls.length) {
      await updateRange(spreadsheetId, `${outTab}!C3`, [[nowISO(), 'No URLs found']], 'RAW');
      return process.exit(0);
    }

    // fetch sequentially (kept simple/stable for Render)
    const allRows = [];
    for (const url of urls) {
      console.log(`[works] fetching: ${url}`);
      const rows = await fetchTableData(url);
      if (rows.length) {
        allRows.push(...rows);
        console.log(`[works] +${rows.length} rows`);
      } else {
        console.warn(`[works] 0 rows for: ${url}`);
      }
    }

    if (allRows.length) {
      // single write; Sheets will auto-expand
      await updateRange(spreadsheetId, `${outTab}!C3`, allRows, 'RAW');
      console.log(`✅ works.cjs wrote ${allRows.length} rows → ${outTab}!C3`);
    } else {
      await updateRange(spreadsheetId, `${outTab}!C3`, [[nowISO(), 'No data to write']], 'RAW');
      console.warn('⚠️ works.cjs: no data to write');
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ works.cjs Error:', err?.message || err);
    process.exit(1);
  }
})();
