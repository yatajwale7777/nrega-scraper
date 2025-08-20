const puppeteer = require('puppeteer');
const { setTimeout } = require('timers/promises');
const { google } = require('googleapis');
const fs = require('fs');
const auth = require('./creds'); // <-- shared JWT client

// CONFIG
const SPREADSHEET_ID = '1D1rgIY_KhL_F86WnCE6ey-0p07Fd8jMvhX3iGOFHpO0';
const SHEET_NAME = 'data';
const SILENT_MODE = false; // true to suppress logs

function log(...args) {
  if (!SILENT_MODE) console.log(...args);
}

function isTermux() {
  return fs.existsSync('/data/data/com.termux/files/usr');
}

// Google Sheets helpers
async function clearSheetRange() {
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A4:Z`,
  });
  log('✅ Sheet range cleared: A4:Z');
}

async function writeToSheet(values) {
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!A4`,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
  log('✅ Data written to Google Sheet.');
}

(async () => {
  // Clear old data
  await clearSheetRange();

  // Launch Puppeteer
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: isTermux() ? '/data/data/com.termux/files/usr/bin/chromium' : undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();

  // Open NREGA tracker page
  await page.goto(
    'https://nregastrep.nic.in/netnrega/dynamic_muster_track.aspx?lflag=eng&state_code=17&fin_year=2025-2026&state_name=%u092e%u0927%u094d%u092f+%u092a%u094d%u0930%u0926%u0947%u0936+&Digest=%2f0dclwkJQM2w4GAt8GjFPw',
    { waitUntil: 'domcontentloaded' }
  );

  // Select filters
  await page.select('#ctl00_ContentPlaceHolder1_ddl_state', '17');
  await setTimeout(1500);
  await page.waitForSelector('#ctl00_ContentPlaceHolder1_ddl_dist', { timeout: 10000 });
  await page.select('#ctl00_ContentPlaceHolder1_ddl_dist', '1738');
  await setTimeout(1500);
  await page.waitForSelector('#ctl00_ContentPlaceHolder1_ddl_blk', { timeout: 15000 });
  await page.select('#ctl00_ContentPlaceHolder1_ddl_blk', '1738002');
  await setTimeout(1500);
  await page.waitForFunction(() => {
    const pan = document.querySelector('#ctl00_ContentPlaceHolder1_ddl_pan');
    return pan && Array.from(pan.options).some(opt => opt.value === 'ALL');
  }, { timeout: 5000 });
  await page.select('#ctl00_ContentPlaceHolder1_ddl_pan', 'ALL');
  await setTimeout(1500);
  await page.click('#ctl00_ContentPlaceHolder1_Rbtn_pay_1');
  await setTimeout(500);
  await page.waitForSelector('#ctl00_ContentPlaceHolder1_Button1', { visible: true, timeout: 10000 });
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }),
    page.click('#ctl00_ContentPlaceHolder1_Button1'),
  ]);

  // Wait for table rows
  await page.waitForSelector('tbody tr[bgcolor="#82b4ff"]', { timeout: 10000 });

  // Extract table
  const tableData = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tbody tr'));
    const headerIndex = rows.findIndex(row => {
      const firstCell = row.querySelector('td');
      return firstCell && firstCell.innerText.trim() === 'SNo.';
    });
    if (headerIndex === -1) return [];

    const headerRow = Array.from(rows[headerIndex].querySelectorAll('td')).map(td => td.innerText.trim());
    const dataRows = [];
    for (let i = headerIndex + 1; i < rows.length; i++) {
      const cols = Array.from(rows[i].querySelectorAll('td'));
      if (cols.length !== headerRow.length) break;
      const rowData = cols.map(td => td.innerText.trim());
      if (rowData.every(cell => cell === '')) break;
      dataRows.push(rowData);
    }
    return [headerRow, ...dataRows];
  });

  // Write data to Google Sheet
  await writeToSheet(tableData);

  await setTimeout(1000);
  await browser.close();
})();
