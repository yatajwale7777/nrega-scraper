// scripts/works.cjs
const { readRange, updateRange, clearRange } = require('../lib/sheets');
const axios = require('../lib/http');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// --- load target from config/targets.json ---
function loadTarget(scriptFile) {
  const cfgPath = path.join(__dirname, '..', 'config', 'targets.json');
  if (!fs.existsSync(cfgPath)) throw new Error("Missing config/targets.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const tgt = cfg.targets?.[scriptFile];
  if (!tgt?.spreadsheetId) throw new Error(`No target mapping for ${scriptFile} in config/targets.json`);
  // expected: { spreadsheetId, readTab: "Sheet3", writeTab: "Sheet5" }
  return tgt;
}

function nowISO() { return new Date().toISOString(); }

// ---- read URLs from readTab!B3:B ----
async function getUrlsFromSheet(spreadsheetId, readTab) {
  const vals = await readRange(spreadsheetId, `${readTab}!B3:B`);
  return (vals || []).flat().filter(Boolean);
}

// ---- fetch table data from a URL (your original logic adapted) ----
async function fetchTableData(url) {
  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 60000
    });

    const $ = cheerio.load(response.data);
    const tables = $('table');
    if (tables.length < 4) return [];

    // Meta (table index 2)
    const metaTable = tables.eq(2).text().toUpperCase().replace(/\s+/g, ' ');
    const extract = (label, nextLabel) => {
      const regex = new RegExp(`${label}\\s*:?[\\s]+([A-Z\\-\\/\\(\\)\\s]+?)\\s+${nextLabel}`, 'i');
      const match = metaTable.match(regex);
      return match ? match[1].trim() : null;
    };

    const district = extract("DISTRICT", "BLOCK") || extract("DISTRICT", "GRAM") || extract("DISTRICT", "PANCHAYAT");
    const block = extract("BLOCK", "PANCHAYAT") || extract("BLOCK", "GRAM");
    const panchayatMatch = metaTable.match(/PANCHAYAT\s*:?\s*([A-Z0-9\-\(\)\/\s]+)/i);
    const panchayat = panchayatMatch ? panchayatMatch[1].trim() : null;
    const state = "MADHYA PRADESH";
    const finYear = (url.match(/fin_year=([\d\-]+)/i) || [null, "UNKNOWN"])[1];

    // Data (table index 3) → skip first 3 rows and last row
    const dataTable = tables.eq(3);
    const rows = dataTable.find('tr').slice(3, -1);

    const data = [];
    rows.each((_, row) => {
      const cells = cheerio(row).find('td, th');
      const rowData = [];
      cells.each((__, cell) => rowData.push(cheerio(cell).text().trim()));
      if (rowData.length > 0) {
        data.push([state, district, block, panchayat, finYear, ...rowData]);
      }
    });

    return data;
  } catch (err) {
    console.error(`❌ Error fetching URL (${url}):`, err?.message || err);
    return [];
  }
}

(async () => {
  try {
    const { spreadsheetId, readTab, writeTab } = loadTarget('works.cjs');
    const outTab = writeTab || 'Sheet5';

    // 1) Clear output area (keep headers row 2 intact)
    await clearRange(spreadsheetId, `${outTab}!C3:Z`);
    // Write headers at C2
    await updateRange(spreadsheetId, `${outTab}!C2`,
      [["STATE", "DISTRICT", "BLOCK", "PANCHAYAT", "FIN YEAR"]],
      "RAW"
    );

    // 2) Get URLs from readTab
    const urls = await getUrlsFromSheet(spreadsheetId, readTab || 'Sheet3');
    console.log(`🌐 Found ${urls.length} URLs.`);

    if (urls.length === 0) {
      await updateRange(spreadsheetId, `${outTab}!C3`, [[nowISO(), "No URLs found in B3:B"]], 'RAW');
      console.log("⚠️ No URLs to process.");
      process.exit(0);
    }

    // 3) Fetch in sequence (kept simple; you can parallelize if needed)
    const all = [];
    for (const url of urls) {
      const rows = await fetchTableData(url);
      all.push(...rows);
    }

    if (all.length > 0) {
      // Write starting at C3 (no need to compute end col; Sheets expands)
      await updateRange(spreadsheetId, `${outTab}!C3`, all, 'RAW');
      console.log(`✅ Wrote ${all.length} rows to ${outTab}.`);
    } else {
      await updateRange(spreadsheetId, `${outTab}!C3`, [[nowISO(), "No data to write"]], 'RAW');
      console.log("⚠️ No data to write.");
    }

    process.exit(0);
  } catch (err) {
    console.error("❌ works.cjs Error:", err?.message || err);
    process.exit(1);
  }
})();
