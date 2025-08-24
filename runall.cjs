// runall.cjs
// Sequentially runs scripts from ./scripts and logs results to Google Sheet.
// Expects env: GOOGLE_CREDENTIALS_BASE64, SHEET_ID, [SHEET_TAB]

const { spawnSync } = require('child_process');
const path = require('path');
const { appendRows } = require('./lib/sheets');

// Ordered list provided by user
const scripts = [
  "trakingfile.cjs",
  "A1.cjs",
  "labour.cjs",
  "master.cjs",
  "link.cjs",
  "achiv.cjs",
  "works.cjs"
];

function nowISO() {
  return new Date().toISOString();
}

function runOne(script) {
  const full = path.join(__dirname, 'scripts', script);
  const start = Date.now();
  const res = spawnSync(process.execPath, [full], { encoding: 'utf8' });
  const end = Date.now();
  const ok = res.status === 0;
  return {
    script,
    ok,
    code: res.status,
    durationMs: end - start,
    stdout: (res.stdout || '').trim().slice(0, 1000),
    stderr: (res.stderr || '').trim().slice(0, 1000)
  };
}

(async () => {
  console.log("🚀 Starting run at", nowISO());
  const perScriptRows = [];
  const results = [];
  for (const s of scripts) {
    console.log(`▶ Running ${s} ...`);
    const r = runOne(s);
    results.push(r);
    console.log(r.ok ? `✅ ${s} OK in ${r.durationMs}ms` : `❌ ${s} FAIL code=${r.code} in ${r.durationMs}ms`);
    // Prepare row: [timestamp, script, status, ms, note]
    perScriptRows.push([nowISO(), s, r.ok ? "OK" : "FAIL", r.durationMs, r.ok ? r.stdout : r.stderr]);
  }

  // Overall summary row
  const allOk = results.every(r => r.ok);
  const totalMs = results.reduce((a, b) => a + b.durationMs, 0);
  const summary = [nowISO(), "SUMMARY", allOk ? "ALL_OK" : "HAS_FAIL", totalMs, `${results.filter(r=>r.ok).length}/${results.length} passed`];

  try {
    await appendRows([
      ["Timestamp", "Script", "Status", "Duration(ms)", "Note"], // header (optional; sheets will accept duplicates)
      ...perScriptRows,
      summary
    ]);
    console.log("📊 Logged to Google Sheet.");
  } catch (e) {
    console.error("⚠️ Failed to log to Google Sheet:", e.message);
  }

  console.log("🏁 Done at", nowISO());
  // Exit with non-zero if any failed (useful for CI)
  process.exit(allOk ? 0 : 1);
})().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
