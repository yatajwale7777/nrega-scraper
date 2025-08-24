const puppeteer = require('puppeteer');
const fs = require('fs');
const { google } = require('googleapis');

// Google Sheets API सेटअप
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const auth = new google.auth.GoogleAuth({
  keyFile: 'credentials.json', // आपकी सेवा खाता JSON फ़ाइल
  scopes: SCOPES,
});
const sheets = google.sheets({ version: 'v4', auth });

const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID'; // अपने Google Sheet का ID डालें
const SHEET_NAME = 'data'; // शीट का नाम
const START_CELL = 'A4'; // डेटा लिखने की प्रारंभिक सेल

(async () => {
  const browser = await puppeteer.launch({ headless: false }); // headless: true प्रोडक्शन के लिए
  const page = await browser.newPage();
  await page.goto('https://nregastrep.nic.in/netnrega/dynamic_muster_track.aspx?lflag=eng&state_code=17&fin_year=2025-2026&state_name=%u092e%u0927%u094d%u092f+%u092a%u094d%u0930%u0926%u0947%u0936+&Digest=%2f0dclwkJQM2w4GAt8GjFPw', { waitUntil: 'networkidle0' });

  // राज्य, जिला, ब्लॉक चयन
  await page.waitForSelector('#ctl00_ContentPlaceHolder1_ddl_state');
  await page.select('#ctl00_ContentPlaceHolder1_ddl_state', '17');
  await page.waitForSelector('#ctl00_ContentPlaceHolder1_ddl_district');
  await page.select('#ctl00_ContentPlaceHolder1_ddl_district', '1738');
  await page.waitForSelector('#ctl00_ContentPlaceHolder1_ddl_blk');
  await page.select('#ctl00_ContentPlaceHolder1_ddl_blk', '1738002');

  // पंचायत चयन
  await page.waitForSelector('#ctl00_ContentPlaceHolder1_ddl_panchayat');
  await page.evaluate(() => {
    const select = document.querySelector('#ctl00_ContentPlaceHolder1_ddl_panchayat');
    const options = Array.from(select.options);
    const allOption = options.find(option => option.text.trim().toUpperCase() === 'ALL');
    if (allOption) {
      allOption.selected = true;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });

  // रेडियो बटन चयन
  await page.waitForSelector('#ctl00_ContentPlaceHolder1_rd_musterstatus_0');
  await page.click('#ctl00_ContentPlaceHolder1_rd_musterstatus_0');

  // सबमिट बटन पर क्लिक
  await page.waitForSelector('#ctl00_ContentPlaceHolder1_btn_submit');
  await Promise.all([
    page.click('#ctl00_ContentPlaceHolder1_btn_submit'),
    page.waitForNavigation({ waitUntil: 'networkidle0' }),
  ]);

  // तालिका डेटा प्राप्त करना
  const tableData = await page.evaluate(() => {
    const table = document.querySelector('#ctl00_ContentPlaceHolder1_grd_muster');
    if (!table) return [];
    const rows = Array.from(table.querySelectorAll('tr'));
    return rows.map(row => {
      const cells = Array.from(row.querySelectorAll('th, td'));
      return cells.map(cell => cell.innerText.trim());
    });
  });

  if (tableData.length === 0) {
    console.log('कोई डेटा नहीं मिला।');
    await browser.close();
    return;
  }

  // Google Sheet में डेटा लिखना
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!${START_CELL}`,
    valueInputOption: 'RAW',
    requestBody: {
      values: tableData,
    },
  });

  console.log('डेटा सफलतापूर्वक Google Sheet में लिखा गया।');
  await browser.close();
})();
