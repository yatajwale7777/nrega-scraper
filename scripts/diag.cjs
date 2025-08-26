// scripts/diag.cjs
const path = require('path');
const fs = require('fs');
const { updateRange } = require('../lib/sheets');

function loadTargets() {
  const p = path.join(__dirname, '..', 'config', 'targets.json');
  if (!fs.existsSync(p)) throw new Error('Missing config/targets.json');
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  return j.targets || {};
}

function decodeSA() {
  try {
    const b64 = process.env.GOOGLE_CREDENTIALS_BASE64 || '';
    const json = Buffer.from(b64, 'base64').toString('utf8');
    const sa = JSON.parse(json);
    return sa.client_email || '(no client_email)';
  } catch (e) { return '(decode failed)'; }
}

(async () => {
  console.log('🔎 DIAG: service account:', decodeSA());
  const targets = loadTargets();
  const stamp = new Date().toISOString();

  const tests = [];
  for (const [name, cfg] of Object.entries(targets)) {
    if (!cfg) continue;
    const spreadsheetId = cfg.spreadsheetId;
    const tab = cfg.writeTab || cfg.tab; // works.cjs has writeTab
    if (spreadsheetId && tab) tests.push({ name, spreadsheetId, tab });
  }

  for (const t of tests) {
    try {
      console.log(`→ TEST write: ${t.name}  sheet=${t.spreadsheetId} tab=${t.tab}`);
      await updateRange(t.spreadsheetId, `${t.tab}!A1`, [[`diag ${t.name} ${stamp}`]], 'RAW');
      console.log(`✅ OK: ${t.name}`);
    } catch (e) {
      const msg =
        e?.errors?.[0]?.message ||
        e?.response?.data?.error?.message ||
        e?.message || String(e);
      console.error(`❌ FAIL: ${t.name} :: ${msg}`);
    }
  }
  process.exit(0);
})();
