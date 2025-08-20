const axios = require("axios");
const cheerio = require("cheerio");
const { google } = require("googleapis");
const auth = require("./creds"); // <-- import JWT client

// Google Sheet config
const SPREADSHEET_ID = "1vi-z__fFdVhUZr3PEDjhM83kqhFtbJX0Ejcfu9M8RKo";

// Write to Google Sheet: infoRow to A3, dataRows to A4
async function writeToSheet(infoRow, dataRows) {
  const sheets = google.sheets({ version: "v4", auth });

  // Write info (Table 2) to A3
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: "R1.1!A3",
    valueInputOption: "RAW",
    requestBody: { values: infoRow },
  });

  // Write full Table 7 (with headers) to A4
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: "R1.1!A4",
    valueInputOption: "RAW",
    requestBody: { values: dataRows },
  });
}

// Fetch and extract data
async function fetchAndScrape(url) {
  const response = await axios.get(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });

  const $ = cheerio.load(response.data);

  // Get 2nd table's full text for info line
  const table2Text = $("table").eq(1).text().replace(/\s+/g, " ").trim();
  const infoRow = [[table2Text]];

  // Extract 7th table (index 6)
  const table7 = $("table").eq(6);
  const rows = [];

  table7.find("tr").each((i, row) => {
    const rowData = [];
    $(row)
      .find("th, td")
      .each((j, cell) => {
        const text = $(cell).text().replace(/\s+/g, " ").trim();
        rowData.push(text);
      });
    rows.push(rowData);
  });

  return { infoRow, dataRows: rows };
}

// Main
(async () => {
  const url =
    "https://nreganarep.nic.in/netnrega/app_issue.aspx?page=b&lflag=&state_name=MADHYA+PRADESH&state_code=17&district_name=BALAGHAT&district_code=1738&block_code=1738002&block_name=KHAIRLANJI&fin_year=2025-2026&source=national&Digest=AS/EzXOjY5nZjEFgC7kuSQ";

  console.log("🔧 Running A1.cjs scrape...");

  try {
    const { infoRow, dataRows } = await fetchAndScrape(url);
    console.log(`📋 Writing 1 info line and ${dataRows.length} table rows...`);

    await writeToSheet(infoRow, dataRows);
    console.log("✅ Data successfully written to Google Sheet Labour report R1.1 sheet.");
  } catch (error) {
    console.error("❌ Error:", error.message || error);
  }
})();
