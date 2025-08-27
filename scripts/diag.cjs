// scripts/diag.cjs
const fs = require('fs');
const path = require('path');
const axios = require('../lib/http');
const { updateRange } = require('../lib/sheets');

function nowISO(){ return new Date().toISOString(); }

(async () => {
  let ok = true;
  try {
    // 1) creds sanity
    const b64 = process.env.GOOGLE_CREDENTIALS_BASE64 || '';
    if (!b64) throw new Error('GOOGLE_CREDENTIALS_BASE64 missing');
    let sa;
    try {
      sa = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    } catch (e) {
      throw new Error('GOOGLE_CREDENTIALS_BASE64 invalid base64/JSON');
    }
    console.log('🔎 DIAG: service account:', sa.client_email);

    // 2) load targets
    const cfgPath = path.join(__dirname, '..', 'config', 'targets.json');
    if (!fs.existsSync(cfgPath)) throw new Error('Missing config/targets.json');
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

    // 3) quick network checks (HEAD/GET with short timeout)
    const urls = [
      // A1/master/labour/achiv/link में इस्तेमाल होने वाले source
      'https://nreganarep.nic.in/',
      'https://nregastrep.nic.in/',
      // एक पूरी A1 पेज भी try कर लेते हैं
      'https://nreganarep.nic.in/netnrega/app_issue.aspx?page=b&lflag=&state_name=MADHYA+PRADESH&state_code=17&district_name=BALAGHAT&district_code=1738&block_code=1738002&block_name=KHAIRLANJI&fin_year=2025-2026&source=national&Digest=AS/EzXOjY5nZjEFgC7kuSQ',
    ];
    for (const u of urls) {
      try {
        await axios.get(u, { timeout: 15000, maxRedirects: 2, validateStatus: s => s >= 200 && s < 400 });
        console.log('🌐 OK:', u);
      } catch (e) {
        console.warn('🌐 FAIL:', u, '-', e.message);
        ok = false;
      }
    }

    // 4) write tests to every target tab (ensures Sheets perms)
    const tests = Object.entries(cfg.targets || {});
    for (const [name, tgt] of tests) {
      const sheet = tgt.spreadsheetId;
      const tab   = tgt.writeTab || tgt.tab;
      if (!sheet || !tab) continue;
      const cell  = `${tab}!A1`;
      const note  = [[`DIAG ok ${name} @ ${nowISO()}`]];
      try {
        await updateRange(sheet, cell, note, 'RAW');
        console.log(`✅ Sheets OK: ${name}  sheet=${sheet} tab=${tab}`);
      } catch (e) {
        console.warn(`❌ Sheets FAIL: ${name} →`, e.message);
        ok = false;
      }
    }

    if (!ok) {
      console.error('❗Diag finished with some failures.');
      process.exit(2);
    }
    console.log('🎉 DIAG PASS (network + sheets)');
    process.exit(0);
  } catch (err) {
    console.error('❌ DIAG ERROR:', err.message || err);
    process.exit(1);
  }
})();