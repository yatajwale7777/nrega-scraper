const { google } = require('googleapis');
const axios = require('axios');
const cheerio = require('cheerio');
const auth = require('./creds'); // <-- shared JWT client

const spreadsheetId = '1bsS9b0FDjzPghhAfMW0YRsTdNnKdN6QMC6TS8vxlsJg';
const sheet3Range = 'Sheet3!B3:B';
const sheet5Range = 'Sheet5!C3:X';

const sheets = google.sheets({ version: 'v4', auth });

async function getUrlsFromSheet() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: sheet3Range,
  });
  return res.data.values?.flat().filter(Boolean) || [];
}

async function clearSheetData() {
  await sheets.spreadsheets.values.clear({
    spreadsheetId,
    range: sheet5Range,
  });
}

async function fetchTableData(url) {
  try {
    const response = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });

    const $ = cheerio.load(response.data);
    const tables = $('table');
    if (tables.length < 4) return [];

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

    const dataTable = tables.eq(3);
    const rows = dataTable.find('tr').slice(3, -1); // Skip header and last row

    const data = [];
    rows.each((_, row) => {
      const cells = $(row).find('td, th');
      const rowData = [];
      cells.each((_, cell) => rowData.push($(cell).text().trim()));
      if (rowData.length > 0) data.push([state, district, block, panchayat, finYear, ...rowData]);
    });

    return data;
  } catch (err) {
    console.error(`❌ Error fetching URL (${url}):`, err.message);
    return [];
  }
}

async function writeDataToSheet(data) {
  if (!data.length) return 0;

  const maxCols = Math.max(...data.map(r => r.length));
  const values = data.map(row => {
    while (row.length < maxCols) row.push('');
    return row;
  });

  const startRow = 3;
  const endRow = startRow + values.length - 1;
  const endCol = String.fromCharCode(67 + maxCols - 1);
  const range = `Sheet5!C${startRow}:${endCol}${endRow}`;

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range,
    valueInputOption: 'RAW',
    requestBody: { values },
  });

  return values.length;
}

async function importAndFlattenTables() {
  try {
    await clearSheetData();

    const headers = ["STATE", "DISTRICT", "BLOCK", "PANCHAYAT", "FIN YEAR"];
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: 'Sheet5!C2',
      valueInputOption: 'RAW',
      requestBody: { values: [headers] },
    });

    const urls = await getUrlsFromSheet();
    console.log(`🌐 Found ${urls.length} URLs.`);

    const allDataArrays = await Promise.all(urls.map(fetchTableData));
    const allData = allDataArrays.flat();

    if (allData.length > 0) {
      const rowsWritten = await writeDataToSheet(allData);
      console.log(`✅ Wrote ${rowsWritten} rows to Sheet5.`);
    } else {
      console.log("⚠️ No data to write.");
    }
  } catch (err) {
    console.error("❌ Error during import:", err.message);
  }
}

// Run the script
importAndFlattenTables();
