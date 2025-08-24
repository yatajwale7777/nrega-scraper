const axios = require('axios');
const cheerio = require('cheerio');
const { google } = require('googleapis');
const auth = require('./creds'); // <-- import JWT client

// Google Sheets setup
const SHEET_ID = '1vi-z__fFdVhUZr3PEDjhM83kqhFtbJX0Ejcfu9M8RKo';
const SHEET_RANGE = 'achiv!A4';

// NREGA URL
const NREGA_URL = 'https://nreganarep.nic.in/netnrega/demand_emp_demand.aspx?file1=empprov&page1=b&lflag=eng&state_name=MADHYA+PRADESH&state_code=17&district_name=BALAGHAT&district_code=1738&block_code=1738002&block_name=KHAIRLANJI&fin_year=2025-2026&source=national&rbl=0&rblhpb=Both&Digest=oDzFUp3uDTVmeqEgUV5uKA';

async function scrapeTables() {
  console.log('🔧 Running achiv.cjs scrape...');

  const { data: html } = await axios.get(NREGA_URL);
  const $ = cheerio.load(html);

  const tables = $('table');
  let finalData = [];

  // Table 2 (index 1): extract one-line date row
  const table2Text = tables.eq(1).text().replace(/\s+/g, ' ').trim();
  const dateMatch = table2Text.match(/(\d{2}-\w{3}-\d{4} \d{2}:\d{2}:\d{2} [AP]M)/);
  const dateRow = [dateMatch ? `Date: ${dateMatch[1]}` : 'Date not found'];
  finalData.push(dateRow); // Push date as first row

  // Table 6 (index 5): main data
  const table6 = tables.eq(5);
  table6.find('tr').each((_, row) => {
    const rowData = [];
    $(row).find('th, td').each((_, cell) => {
      rowData.push($(cell).text().trim());
    });
    if (rowData.length > 0) finalData.push(rowData);
  });

  console.log(`📋 Extracted ${finalData.length - 1} data rows (plus date).`);
  return finalData;
}

async function clearSheet(sheets) {
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SHEET_ID,
    range: 'achiv!A4:Z',
  });
  console.log('🧹 Cleared achiv!A4:Z');
}

async function writeToSheet(data) {
  const sheets = google.sheets({ version: 'v4', auth }); // <-- use shared JWT client

  // Clear before writing
  await clearSheet(sheets);

  // Write new data
  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: SHEET_RANGE,
    valueInputOption: 'RAW',
    requestBody: { values: data }
  });

  console.log('✅ Data successfully written to Google Sheet labour report achiv sheet.');
}

async function main() {
  const data = await scrapeTables();
  await writeToSheet(data);
}

main().catch(err => console.error('❌ Error:', err));
