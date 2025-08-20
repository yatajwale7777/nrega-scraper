const axios = require("axios");
const cheerio = require("cheerio");
const { google } = require("googleapis");
const auth = require("./creds"); // <-- shared JWT client

// Google Sheet config
const SPREADSHEET_ID = "1D1rgIY_KhL_F86WnCE6ey-0p07Fd8jMvhX3iGOFHpO0";

// Write to Google Sheet: infoRow to A19, dataRows to A20
async function writeToSheet(infoRow, dataRows) {
  const sheets = google.sheets({ version: "v4", auth });

  // Write info (Table 2) to A19
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: "Sheet5!A19",
    valueInputOption: "RAW",
    requestBody: { values: infoRow },
  });

  // Write full Table 3 (with headers) to A20
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: "Sheet5!A20",
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

  // Table 2 (info)
  const table2Text = $("table").eq(1).text().replace(/\s+/g, " ").trim();
  const infoRow = [[table2Text]];

  // Table 3 (data)
  const table3 = $("table").eq(2);
  const rows = [];
  table3.find("tr").each((i, row) => {
    const rowData = [];
    $(row)
      .find("th, td")
      .each((_, cell) => rowData.push($(cell).text().trim()));
    rows.push(rowData);
  });

  return { infoRow, dataRows: rows };
}

// Main
(async () => {
  const url =
    "https://nreganarep.nic.in/netnrega/dpc_sms_new_dtl.aspx?page=d&Short_Name=MP&state_name=MADHYA+PRADESH&state_code=17&district_name=BALAGHAT&district_code=1738&block_name=KHAIRLANJI&block_code=1738002&fin_year=2025-2026&EDepartment=ALL&wrkcat=ALL&worktype=ALL&Digest=7pxWKhbxrTXuPBiiRtODgQ";

  console.log("🔧 Running master.cjs scrape...");

  try {
    const { infoRow, dataRows } = await fetchAndScrape(url);
    console.log(`📋 Writing 1 info line and ${dataRows.length} table rows...`);

    await writeToSheet(infoRow, dataRows);
    console.log("✅ Data successfully written to Google Sheet Labour report Sheet5!");
  } catch (error) {
    console.error("❌ Error:", error.message || error);
  }
})();
