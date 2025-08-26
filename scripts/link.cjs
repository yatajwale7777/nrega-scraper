// scripts/link.cjs
try { require('dotenv').config(); } catch {} // local .env; Render/Actions पर env से आएगा

const axios = require('../lib/http'); // your tuned axios client
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const { readRange, updateRange /*, clearRange */ } = require('../lib/sheets');

// --- load target from config/targets.json ---
function loadTarget(scriptFile) {
  const cfgPath = path.join(__dirname, '..', 'config', 'targets.json');
  if (!fs.existsSync(cfgPath)) throw new Error('Missing config/targets.json');
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  const tgt = cfg.targets?.[scriptFile];
  if (!tgt?.spreadsheetId || !tgt?.tab) {
    throw new Error(`No target mapping for ${scriptFile} in config/targets.json`);
  }
  return tgt; // { spreadsheetId, tab }
}

function nowISO() { return new Date().toISOString(); }
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// --- HTTP get with retries/backoff ---
async function getWithRetries(url, tries = 3) {
  let lastErr;
  for (let i = 1; i <= tries; i++) {
    try {
      return await axios.get(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
            '(KHTML, like Gecko) Chrome/124 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        },
        timeout: 60000,
        maxRedirects: 3,
        validateStatus: s => s >= 200 && s < 400
      });
    } catch (e) {
      lastErr = e;
      const backoff = 1500 * i * i; // 1.5s, 6s, 13.5s
      console.warn(`[link] HTTP failed (try ${i}/${tries}) → ${e?.message || e}. Retrying in ${backoff}ms`);
      await sleep(backoff);
    }
  }
  throw lastErr;
}

// ---- read URL from Sheet (B2) ----
async function getUrlFromSheet(spreadsheetId, tab) {
  const vals = await readRange(spreadsheetId, `${tab}!B2`);
  const raw = vals?.[0]?.[0] || '';
  return String(raw).trim();
}

// ---- fetch <a href="..."> links, normalize, filter, dedupe ----
function normalizeUrl(baseUrl, href) {
  try {
    // ignore anchors, mailto, javascript, tel
    const h = String(href || '').trim();
    if (!h || h.startsWith('#')) return null;
    const lower = h.toLowerCase();
    if (lower.startsWith('mailto:') || lower.startsWith('javascript:') || lower.startsWith('tel:')) return null;

    // absolute or relative → absolute
    const abs = new URL(h, baseUrl).toString();
    return abs;
  } catch {
    return null;
  }
}

async function fetchHyperlinks(baseUrl) {
  const { data: html } = await getWithRetries(baseUrl, 3);
  const $ = cheerio.load(html);

  const set = new Set();
  $('a').each((_, el) => {
    const href = $(el).attr('href');
    const abs = normalizeUrl(baseUrl, href);
    if (abs) set.add(abs);
  });

  // return as column values (each row = [url])
  return Array.from(set).map(u => [u]);
}

// ---- main ----
(async () => {
  try {
    const { spreadsheetId, tab } = loadTarget('link.cjs');

    // 1) Read URL from B2
    const url = await getUrlFromSheet(spreadsheetId, tab);
    if (!url) throw new Error(`URL not found in ${tab}!B2`);

    // 2) Scrape hyperlinks
    const links = await fetchHyperlinks(url);

    // 3) (Optional) clear old output:
    // await clearRange(spreadsheetId, `${tab}!B6:B`);

    // 4) Write links starting at B6
    if (links.length > 0) {
      await updateRange(spreadsheetId, `${tab}!B6`, links, 'RAW');
      console.log(`✅ Imported ${links.length} hyperlinks to ${tab}!B6:B`);
    } else {
      await updateRange(spreadsheetId, `${tab}!B6`, [[nowISO(), 'No links found']], 'RAW');
      console.log('⚠️ No links found; wrote timestamp note.');
    }

    process.exit(0);
  } catch (err) {
    const msg =
      err?.response?.status
        ? `${err.response.status} ${err.response.statusText}`
        : (err?.message || String(err));
    console.error('❌ link.cjs Error:', msg);
    process.exit(1);
  }
})();
