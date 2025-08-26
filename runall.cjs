// runall.cjs
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { appendRowsTo } = require('./lib/sheets');

function nowISO() { return new Date().toISOString(); }
const clamp = (s, n = 2000) => (s || '').toString().slice(0, n);

const scripts = [
  'trakingfile.cjs',
  'A1.cjs',
  'labour.cjs',
  'master.cjs',
  'link.cjs',
  'achiv.cjs',
  'works.cjs',
];

// per-script settings
const timeouts = {
  'trakingfile.cjs': 180000, // 180s (Puppeteer)
  'A1.cjs': 120000,
  'labour.cjs': 120000,
  'master.cjs': 120000,
  'link.cjs': 120000,
  'achiv.cjs': 120000,
  'works.cjs': 90000,
};
const retries = {
  'trakingfile.cjs': 1, // Puppeteer को 1 retry काफी है
  'A1.cjs': 2,
  'labour.cjs': 1,
  'master.cjs': 1,
  'link.cjs': 1,
  'achiv.cjs': 1,
  'works.cjs': 0,
};

// --- Load config/targets.json (for log + heartbeats)
const cfgPath = path.join(__dirname, 'config', 'targets.json');
if (!fs.existsSync(cfgPath)) {
  console.error('Missing config/targets.json');
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const LOG_ID = cfg?.log?.spreadsheetId;
const LOG_TAB = cfg?.log?.tab || 'Runs';
if (!LOG_ID) {
  console.error('log.spreadsheetId missing in config/targets.json');
  process.exit(1);
}

// --- Env sanity (Google creds base64 decodes to JSON?)
(function sanityEnv() {
  const b64 = process.env.GOOGLE_CREDENTIALS_BASE64 || '';
  if (!b64) {
    console.error('ENV ERROR: GOOGLE_CREDENTIALS_BASE64 is empty/missing');
    process.exit(1);
  }
  try {
    const raw = Buffer.from(b64, 'base64').toString('utf8');
    const j = JSON.parse(raw);
    if (!j.client_email || !j.private_key) {
      throw new Error('service account JSON missing fields');
    }
  } catch (e) {
    console.error('ENV ERROR: GOOGLE_CREDENTIALS_BASE64 invalid base64/JSON:', e.message);
    process.exit(1);
  }
})();

// --- run a single script once
function runOnce(script) {
  const full = path.join(__dirname, 'scripts', script);
  const start = Date.now();
  const res = spawnSync(process.execPath, [full], {
    cwd: __dirname,
    env: process.env,
    encoding: 'utf8',
    timeout: timeouts[script] ?? 120000, // ms
    killSignal: 'SIGKILL',
    maxBuffer: 10 * 1024 * 1024, // 10MB
  });
  const end = Date.now();
  const timedOut = res.error?.code === 'ETIMEDOUT';
  const status = timedOut ? 124 : (Number.isInteger(res.status) ? res.status : 1);
  return {
    script,
    ok: status === 0,
    code: status,
    durationMs: end - start,
    stdout: clamp(res.stdout),
    stderr: clamp(res.stderr || (res.error ? String(res.error) : '')),
    timedOut,
  };
}

// --- run with retries + backoff
async function runWithRetries(script) {
  const maxTry = (retries[script] ?? 0) + 1;
  let last = null;
  for (let i = 1; i <= maxTry; i++) {
    if (i > 1) {
      const back = 1500 * i * i; // 1.5s, 6s, 13.5s...
      console.log(`↻ Retry ${i}/${maxTry} for ${script} after ${back}ms`);
      await new Promise(r => setTimeout(r, back));
    }
    const r = runOnce(script);
    last = r;
    if (r.ok) return r;

    // अगर timeout या नेटवर्क जैसा error (ECONNRESET) तो retry allow करें
    const nety = /ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN/i.test(r.stderr) || r.timedOut;
    if (!nety && i >= maxTry) return r;
    if (!nety) return r; // non-network error → retry का फायदा कम
  }
  return last;
}

// --- central log helper
async function logRow(script, r) {
  const row = [[
    nowISO(),
    script,
    r.ok ? 'OK' : (r.timedOut ? 'TIMEOUT' : 'FAIL'),
    r.durationMs,
    r.ok ? r.stdout : r.stderr,
  ]];
  try { await appendRowsTo(LOG_ID, LOG_TAB, row); }
  catch (e) { console.error('  ↳ Log failed:', e.message); }
}

// --- heartbeat helper
async function heartbeat(script, r) {
  const tgt = cfg.targets?.[script];
  if (!tgt?.spreadsheetId) return;
  const hbTab = tgt.writeTab || tgt.tab;
  if (!hbTab) return;
  const hb = [[ nowISO(), 'RUN', script, r.ok ? 'OK' : 'FAIL', r.durationMs ]];
  try {
    await appendRowsTo(tgt.spreadsheetId, hbTab, hb);
    console.log(`  ↳ Heartbeat to ${hbTab}`);
  } catch (e) {
    console.error(`  ↳ Heartbeat failed for ${hbTab}:`, e.message);
  }
}

(async () => {
  console.log('🚀 Run start:', nowISO());
  // try to add header once (harmless if duplicates)
  try {
    await appendRowsTo(LOG_ID, LOG_TAB, [[ 'Timestamp','Script','Status','Duration(ms)','Note' ]]);
  } catch {}

  const results = [];
  for (const s of scripts) {
    console.log(`▶ Running ${s} ...`);
    const r = await runWithRetries(s);
    results.push(r);
    await logRow(s, r);
    await heartbeat(s, r);
    console.log(r.ok
      ? `✅ ${s} OK (${r.durationMs}ms)`
      : (r.timedOut
          ? `⏱️ ${s} TIMEOUT (${r.durationMs}ms)`
          : `❌ ${s} FAIL code=${r.code} (${r.durationMs}ms)`));
  }

  const allOk = results.every(r => r.ok);
  console.log('🏁 Done:', nowISO(), 'Status:', allOk ? 'ALL_OK' : 'HAS_FAIL');
  process.exit(allOk ? 0 : 1);
})().catch(err => {
  console.error('Fatal:', err?.message || err);
  process.exit(1);
});
