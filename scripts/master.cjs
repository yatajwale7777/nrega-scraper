// scripts/master.cjs
const axios = require('../lib/http');
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const { updateRange /*, clearRange */ } = require("../lib/sheets"); // env-based service account

// --- load target from config/targets.json ---
function loadTarget(scriptFile) {
  const cfgPath = path.join(__dirname, "..", "config", "targets.json");
  if (!fs.existsSync(cfgPath)) throw new Error("Missing config/targets.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  const tgt = cfg.targets?.[scriptFile];
  if (!tgt) throw new Error(`No target mapping for ${scriptFile} in config/targets.json`);
  // expected: { spreadsheetId: "...", tab: "Sheet5" }
  return tgt;
}

function nowISO() { return new Date().toISOString(); }

// NREGA URL (same as your original)
const NREGA_URL =
  "https://nreganarep.nic.in/netnrega/dpc_sms_new_dtl.aspx?page=d&Short_Name=MP&state_name=MADHYA+PRADESH&state_code=17&district_name=BALAGHAT&district_code=1738&block_name=KHAIRLANJI&block_code=1738002&fin_year=2025-2026&EDepartment=ALL&wrkcat=ALL&worktype=ALL&Digest=7pxWKhbxrTXuPBiiRtODgQ";

// ---- scrape helpers ----
async function fetchAndScrape(url) {
  const { data: html } = await axios.get(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    timeout: 60000
  });

  const $ = cheerio.load(html);

  // Table 2 (index 1) → single-cell info line
  const table2Text = $("table").eq(1).text().replace(/\s+/g, " ").trim();
  const infoRow = [[table2Text]]; // goes to A19

  // Table 3 (index 2) → full rows (with headers) to A20
  const table3 = $("table").eq(2);
  const dataRows = [];
  table3.find("tr").each((i, row) => {
    const rowData = [];
    $(row).find("th, td").each((_, cell) => {
      const text = $(cell).text().replace(/\s+/g, " ").trim();
      rowData.push(text);
    });
    if (rowData.some(v => v && v.length)) dataRows.push(rowData);
  });

  return { infoRow, dataRows };
}

// ---- main ----
(async () => {
  try {
    const { spreadsheetId, tab } = loadTarget("master.cjs"); // tab should be "Sheet5"

    console.log("🔧 Running master.cjs scrape...", nowISO());

    const { infoRow, dataRows } = await fetchAndScrape(NREGA_URL);
    console.log(`📋 Table2→A19 cells: ${infoRow.length}x${infoRow[0]?.length || 0}`);
    console.log(`📊 Table3 rows: ${dataRows.length}`);

    // (Optional) पहले साफ़ करना हो तो uncomment करें:
    // await clearRange(spreadsheetId, `${tab}!A19:Z`);

    // Write info (Table 2) to A19
    await updateRange(spreadsheetId, `${tab}!A19`, infoRow, "RAW");

    // Write full Table 3 to A20
    if (dataRows.length > 0) {
      await updateRange(spreadsheetId, `${tab}!A20`, dataRows, "RAW");
    }

    console.log("✅ master.cjs: data written to", `${tab}!A19`,"and",`${tab}!A20`);
    process.exit(0);
  } catch (err) {
    console.error("❌ master.cjs Error:", err?.message || err);
    process.exit(1);
  }
})();
