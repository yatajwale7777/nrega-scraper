// runall.cjs
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { appendRowsTo } = require('./lib/sheets');

const scripts = [
  "trakingfile.cjs",
  "A1.cjs",
  "labour.cjs",
  "master.cjs",
  "link.cjs",
  "achiv.cjs",
  "works.cjs"
];

function nowISO() { return new Date().toISOString(); }

// Load config
const cfgPath = path.join(__dirname, 'config', 'targets.json');
if (!fs.existsSync(cfgPath)) {
  console.error("Missing config/targets.json");
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const LOG_ID = cfg?.log?.spreadsheetId;
const LOG_TAB = cfg?.log?.tab || 'Runs';
if (!LOG_ID) {
  console.error("log.spreadsheetId missing in config/targets.json");
  process.exit(1);
}

function runOne(script) {
  const full = path.join(__dirname, 'scripts', script);
  const start = Date.now();
  const res = spawnSync(process.execPath, [full], { encoding: 'utf8' });
  const end = Date.now();
  const ok = res.status === 0;
  return {
    script, ok, code: res.status,
    durationMs: end - start,
    stdout: (res.stdout || '').trim().slice(0, 1000),
    stderr: (res.stderr || '').trim().slice(0, 1000)
  };
}

(async () => {
  console.log("🚀 Run start:", nowISO());

  // Optional header once (Sheets allow duplicates; harmless if appended again)
  const header = [["Timestamp","Script","Status","Duration(ms)","Note"]];
  try { await appendRowsTo(LOG_ID, LOG_TAB, header); } catch {}

  const results = [];

  for (const s of scripts) {
    console.log(`▶ Running ${s} ...`);
    const r = runOne(s);
    results.push(r);

    // Central log
    const logRow = [[ nowISO(), s, r.ok ? "OK":"FAIL", r.durationMs, r.ok ? r.stdout : r.stderr ]];
    try {
      await appendRowsTo(LOG_ID, LOG_TAB, logRow);
      console.log("  ↳ Logged to Runs");
    } catch (e) {
      console.error("  ↳ Log failed:", e.message);
    }

    // Heartbeat to target (if mapped)
    const tgt = cfg.targets?.[s];
    if (tgt?.spreadsheetId) {
      const hbTab = tgt.writeTab || tgt.tab; // prefer writeTab if present
      if (hbTab) {
        const hb = [[ nowISO(), "RUN", s, r.ok ? "OK":"FAIL", r.durationMs ]];
        try {
          await appendRowsTo(tgt.spreadsheetId, hbTab, hb);
          console.log(`  ↳ Heartbeat to ${hbTab}`);
        } catch (e) {
          console.error(`  ↳ Heartbeat failed for ${hbTab}:`, e.message);
        }
      }
    }

    console.log(r.ok ? `✅ ${s} OK (${r.durationMs}ms)` : `❌ ${s} FAIL code=${r.code} (${r.durationMs}ms)`);
  } // ←←← for-loop अब यहीं पूरा बंद हो रहा है

  const allOk = results.every(r => r.ok);
  console.log("🏁 Done:", nowISO(), "Status:", allOk ? "ALL_OK":"HAS_FAIL");
  process.exit(allOk ? 0 : 1);
})().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
