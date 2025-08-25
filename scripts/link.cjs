// scripts/link.cjs
const axios = require('../lib/http');
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const { readRange, updateRange /*, clearRange */ } = require("../lib/sheets");

// --- load target from config/targets.json ---
function loadTarget(scriptFile) {
  const cfgPath = path.join(__dirname, "..", "config", "targets.json");
  if (!fs.existsSync(cfgPath)) throw new Error("Missing config/targets.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  const tgt = cfg.targets?.[scriptFile];
  if (!tgt) throw new Error(`No target mapping for ${scriptFile} in config/targets.json`);
  // expected: { spreadsheetId: "...", tab: "Sheet2" }
  return tgt;
}

function nowISO() { return new Date().toISOString(); }

// ---- read URL from Sheet ----
async function getUrlFromSheet(spreadsheetId, tab) {
  const vals = await readRange(spreadsheetId, `${tab}!B2`);
  return vals?.[0]?.[0] || "";
}

// ---- fetch <a href="..."> links from the URL ----
async function fetchHyperlinks(url) {
  const { data } = await axios.get(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    timeout: 60000
  });
  const $ = cheerio.load(data);
  const links = [];
  $("a").each((_, el) => {
    const href = $(el).attr("href");
    if (href) links.push([href]); // one link per row in column B
  });
  return links;
}

// ---- main ----
(async () => {
  try {
    const { spreadsheetId, tab } = loadTarget("link.cjs");

    // 1) Read URL from B2
    const url = await getUrlFromSheet(spreadsheetId, tab);
    if (!url) throw new Error(`URL not found in ${tab}!B2`);

    // 2) Scrape all hyperlinks
    const links = await fetchHyperlinks(url);

    // 3) (Optional) clear old output first:
    // await clearRange(spreadsheetId, `${tab}!B6:B`);

    // 4) Write links starting at B6
    if (links.length > 0) {
      await updateRange(spreadsheetId, `${tab}!B6`, links, "RAW");
    } else {
      // If no links, at least write a note with timestamp
      await updateRange(spreadsheetId, `${tab}!B6`, [[nowISO(), "No links found"]], "RAW");
    }

    console.log(`✅ Imported ${links.length} hyperlinks to ${tab}!B6:B`);
    process.exit(0);
  } catch (err) {
    console.error("❌ link.cjs Error:", err?.message || err);
    process.exit(1);
  }
})();
