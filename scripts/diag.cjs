// scripts/diag.cjs
const { updateRange } = require('../lib/sheets');
const fs = require('fs'); const path = require('path');

function loadTargets() {
  const p = path.join(__dirname, '..', 'config', 'targets.json');
  if (!fs.existsSync(p)) throw new Error('Missing config/targets.json');
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  return j.targets || {};
}

(async () => {
  const t = loadTargets();
  const tests = [];
  for (const [name, v] of Object.entries(t)) {
    if (name === 'works.cjs') {
      const sid = v.spreadsheetId;
      const tab = v.writeTab || v.tab || 'Sheet5';
      tests.push({ name, spreadsheetId: sid, tab });
    } else {
      tests.push({ name, spreadsheetId: v.spreadsheetId, tab: v.tab });
    }
  }

  const stamp = new Date().toISOString();
  for (const x of tests) {
    if (!x.spreadsheetId || !x.tab) { console.log('SKIP', x); continue; }
    try {
      console.log('→ TEST write', x.name, x.spreadsheetId, x.tab);
      await updateRange(x.spreadsheetId, `${x.tab}!A1`, [[`diag ${x.name} ${stamp}`]], 'RAW');
      console.log('✅ OK', x.name);
    } catch (e) {
      const msg = e?.errors?.[0]?.message || e?.response?.data?.error?.message || e?.message || String(e);
      console.error('❌ FAIL', x.name, '::', msg);
    }
  }
  process.exit(0);
})();
