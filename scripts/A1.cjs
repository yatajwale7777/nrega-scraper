// scripts/A1.cjs
const axios = require('../lib/http');
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const { updateRange } = require("../lib/sheets"); // use service account via env

// --- load target from config/targets.json ---
function loadTarget(scriptFile) {
  const cfgPath = path.join(__dirname, "..", "config", "targets.json");
  if (!fs.existsSync(cfgPath)) throw new Error("Missing config/targets.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  const tgt = cfg.targets?.[scriptFile];
  if (!tgt) throw new Error(`No target mapping for ${scriptFile} in config/targets.json`);
  // expected: { spreadsheetId: "...", tab: "R1.1" }
  return tgt;
}

function nowISO() { return new Date().toISOString(); }

// ---- scrape helpers ----
async function fetchAndScrape(url) {
  const response = await axios.get(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    timeout: 60000
  });

  const $ = cheerio.load(response.data);

  // Table 2 (index 1) → single-cell info line
  const table2Text = $("table").eq(1).text().replace(/\s+/g, " ").trim();
  const infoRow = [[table2Text]];  // A3 पर एक सेल में पूरा टेक्स्ट

  // Table 7 (index 6) → full rows (with headers)
  const table7 = $("table").eq(6);
  const dataRows = [];
  table7.find("tr").each((i, row) => {
    const rowData = [];
    $(row).find("th, td").each((j, cell) => {
      const text = $(cell).text().replace(/\s+/g, " ").trim();
      rowData.push(text);
    });
    // खाली row skip (optional)
    if (rowData.some(v => v && v.length)) dataRows.push(rowData);
  });

  return { infoRow, dataRows };
}

// ---- main ----
(async () => {
  // Config-driven target
  const { spreadsheetId, tab } = loadTarget("A1.cjs"); // tab should be "R1.1"

  // Your source URL (unchanged)
  const url =
    "https://nreganarep.nic.in/netnrega/app_issue.aspx?page=b&lflag=&state_name=MADHYA+PRADESH&state_code=17&district_name=BALAGHAT&district_code=1738&block_code=1738002&block_name=KHAIRLANJI&fin_year=2025-2026&source=national&Digest=AS/EzXOjY5nZjEFgC7kuSQ";

  console.log("🔧 Running A1.cjs scrape...", nowISO());

  try {
    const { infoRow, dataRows } = await fetchAndScrape(url);
    console.log(`📋 Table2→A3 cells: ${infoRow.length}x${infoRow[0]?.length || 0}`);
    console.log(`📊 Table7 rows: ${dataRows.length}`);

    // Write info (Table 2) to A3
    await updateRange(spreadsheetId, `${tab}!A3`, infoRow, "RAW");

    // Write full Table 7 (with headers) to A4
    // NOTE: यह overwrite करता है starting A4 से (जितनी size dataRows होगी)
    if (dataRows.length > 0) {
      await updateRange(spreadsheetId, `${tab}!A4`, dataRows, "RAW");
    }

    console.log("✅ A1.cjs: data written to", `${tab}!A3`,"and",`${tab}!A4`);
    process.exit(0);
  } catch (err) {
    console.error("❌ A1.cjs Error:", err?.message || err);
    process.exit(1);
  }
})();
