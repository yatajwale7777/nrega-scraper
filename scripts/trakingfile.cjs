// scripts/trakingfile.cjs
// NOTE: axios import हटाया, यह फाइल में use नहीं हो रहा था
const puppeteer = require('puppeteer');
const { setTimeout: delay } = require('timers/promises');
const fs = require('fs');
const path = require('path');
const { updateRange, clearRange } = require('../lib/sheets'); // env-based service account

// --- load target from config/targets.json ---
function loadTarget(scriptFile) {
  const cfgPath = path.join(__dirname, '..', 'config', 'targets.json');
  if (!fs.existsSync(cfgPath)) throw new Error('Missing config/targets.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const tgt = cfg.targets?.[scriptFile];
  if (!tgt) throw new Error(`No target mapping for ${scriptFile} in config/targets.json`);
  // expected: { spreadsheetId: "...", tab: "data" }
  return tgt;
}

function nowISO() { return new Date().toISOString(); }
function isTermux() { return fs.existsSync('/data/data/com.termux/files/usr'); }

const SILENT_MODE = false; // true to suppress logs
function log(...args) { if (!SILENT_MODE) console.log(...args); }

// NREGA tracker URL
const TRACK_URL =
  'https://nregastrep.nic.in/netnrega/dynamic_muster_track.aspx?lflag=eng&state_code=17&fin_year=2025-2026&state_name=%u092e%u0927%u094d%u092f+%u092a%u094d%u0930%u0926%u0947%u0936+&Digest=%2f0dclwkJQM2w4GAt8GjFPw';

// ---------- Puppeteer helpers ----------
async function launchBrowser() {
  const proxyArg =
    process.env.HTTPS_PROXY ? `--proxy-server=${process.env.HTTPS_PROXY}` :
    (process.env.HTTP_PROXY ? `--proxy-server=${process.env.HTTP_PROXY}` : null);

  const launchOpts = {
    headless: 'new',                           // modern headless
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-zygote',
      '--single-process',
      ...(proxyArg ? [proxyArg] : []),
    ],
    // 🔑 हमेशा bundled Chromium use करें (Render पर "Chrome not found" से बचेगा)
    executablePath: isTermux()
      ? '/data/data/com.termux/files/usr/bin/chromium'
      : puppeteer.executablePath(),
    defaultViewport: { width: 1366, height: 768 },
    timeout: 120000,
  };
  return puppeteer.launch(launchOpts);
}

async function gotoWithRetries(page, url, tries = 3) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 120000 });
      // safety: dom ready
      await page.waitForFunction('document.readyState==="complete"', { timeout: 20000 });
      return;
    } catch (e) {
      lastErr = e;
      const backoff = 1500 * i * i; // 1.5s, 6s, 13.5s
      log(`[goto] attempt ${i}/${tries} failed → ${e.message}. retrying in ${backoff}ms`);
      await delay(backoff);
    }
  }
  throw lastErr;
}

async function selectValue(page, selector, value, waitMs = 1200) {
  await page.waitForSelector(selector, { timeout: 30000 });
  await page.select(selector, value);
  await delay(waitMs);
}

async function extractTable(page) {
  await page.waitForSelector('tbody tr', { timeout: 30000 });

  const tableData = await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('tbody tr'));

    const headerIndex = rows.findIndex(row => {
      const firstCell = row.querySelector('td, th');
      return firstCell && firstCell.textContent.trim() === 'SNo.';
    });
    if (headerIndex === -1) return [];

    const headerCells = Array.from(rows[headerIndex].querySelectorAll('td, th'));
    const header = headerCells.map(td => td.textContent.trim());

    const dataRows = [];
    for (let i = headerIndex + 1; i < rows.length; i++) {
      const cells = Array.from(rows[i].querySelectorAll('td, th'));
      if (cells.length !== header.length) break;
      const row = cells.map(td => td.textContent.trim());
      if (row.every(cell => cell === '')) break;
      dataRows.push(row);
    }
    return [header, ...dataRows];
  });

  return tableData || [];
}

(async () => {
  let browser;
  try {
    const { spreadsheetId, tab } = loadTarget('trakingfile.cjs'); // tab should be "data"
    const writeStartRange = `${tab}!A4`;

    log('🧹 Clearing sheet range', `${tab}!A4:Z`);
    await clearRange(spreadsheetId, `${tab}!A4:Z`);

    log('🌐 Launching browser...');
    browser = await launchBrowser();
    const page = await browser.newPage();

    // lighter network: images/css/fonts block (speed + stability)
    await page.setRequestInterception(true);
    page.on('request', req => {
      const type = req.resourceType();
      if (type === 'image' || type === 'font' || type === 'stylesheet' || type === 'media') {
        return req.abort();
      }
      req.continue();
    });

    // Proxy auth (if any)
    if (process.env.PROXY_USER && process.env.PROXY_PASS) {
      await page.authenticate({
        username: process.env.PROXY_USER,
        password: process.env.PROXY_PASS,
      });
    }

    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/124 Safari/537.36'
    );

    log('🔗 Opening tracker page…', TRACK_URL);
    await gotoWithRetries(page, TRACK_URL, 3);

    // --- Select filters in sequence ---
    await selectValue(page, '#ctl00_ContentPlaceHolder1_ddl_state', '17');       // State
    await selectValue(page, '#ctl00_ContentPlaceHolder1_ddl_dist', '1738');      // District
    await selectValue(page, '#ctl00_ContentPlaceHolder1_ddl_blk', '1738002');    // Block

    // Wait until Panchayat dropdown has 'ALL'
    await page.waitForFunction(() => {
      const pan = document.querySelector('#ctl00_ContentPlaceHolder1_ddl_pan');
      return pan && Array.from(pan.options).some(opt => opt.value === 'ALL');
    }, { timeout: 30000 });
    await selectValue(page, '#ctl00_ContentPlaceHolder1_ddl_pan', 'ALL');

    // Select radio "Payment Issued"
    await page.waitForSelector('#ctl00_ContentPlaceHolder1_Rbtn_pay_1', { timeout: 20000 });
    await page.click('#ctl00_ContentPlaceHolder1_Rbtn_pay_1');
    await delay(500);

    // Submit
    await page.waitForSelector('#ctl00_ContentPlaceHolder1_Button1', { visible: true, timeout: 30000 });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 120000 }),
      page.click('#ctl00_ContentPlaceHolder1_Button1'),
    ]);

    // Extract table
    log('📥 Extracting table…');
    const tableData = await extractTable(page);

    // Write to Sheet
    if (tableData.length > 0) {
      log(`📊 Writing ${tableData.length - 1} data rows (plus header) → ${writeStartRange}`);
      await updateRange(spreadsheetId, writeStartRange, tableData, 'RAW');
    } else {
      log('⚠️ No table data found; writing placeholder note.');
      await updateRange(spreadsheetId, writeStartRange, [[nowISO(), 'No data found']], 'RAW');
    }

    log('✅ trakingfile.cjs completed.');
    process.exit(0);
  } catch (err) {
    console.error('❌ trakingfile.cjs Error:', err?.message || err);
    process.exit(1);
  } finally {
    try { if (browser) await browser.close(); } catch {}
  }
})();
