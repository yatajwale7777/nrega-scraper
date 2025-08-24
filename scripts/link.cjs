const { google } = require("googleapis");
const axios = require("axios");
const cheerio = require("cheerio");
const auth = require("./creds"); // <-- shared JWT client

// Spreadsheet config
const SPREADSHEET_ID = "1bsS9b0FDjzPghhAfMW0YRsTdNnKdN6QMC6TS8vxlsJg";
const SHEET_NAME = "Sheet2";

// Read target URL from Sheet2!B2
async function getUrlFromSheet() {
  const sheets = google.sheets({ version: "v4", auth });
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!B2`,
  });
  return res.data.values?.[0]?.[0];
}

// Scrape all <a href="..."> links
async function fetchHyperlinks(url) {
  const { data } = await axios.get(url);
  const $ = cheerio.load(data);
  const links = [];
  $("a").each((_, el) => {
    const href = $(el).attr("href");
    if (href) links.push([href]);
  });
  return links;
}

// Write links to Sheet2!B6
async function writeLinksToSheet(links) {
  const sheets = google.sheets({ version: "v4", auth });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!B6`,
    valueInputOption: "RAW",
    requestBody: { values: links },
  });
}

// Main runner
(async () => {
  try {
    const url = await getUrlFromSheet();
    if (!url) throw new Error("URL not found in Sheet2!B2");

    const links = await fetchHyperlinks(url);
    await writeLinksToSheet(links);

    console.log(`✅ Imported ${links.length} hyperlinks to ${SHEET_NAME}!B6:B`);
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
})();
