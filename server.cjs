// server.cjs
try { require('dotenv').config(); } catch {} // local only; Render पर harmless

const http = require('http');
const https = require('https');
const path = require('path');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3000;

let isRunning = false;
let lastRun = 'never';
let lastStatus = 'unknown';
let lastPid = null;
let lastError = null;

// helpful log
const B64 = process.env.GOOGLE_CREDENTIALS_BASE64 || '';
console.log('[env] GOOGLE_CREDENTIALS_BASE64 length:', B64.length);

// ---- suspend service on Render (optional) ----
function suspendService() {
  return new Promise((resolve) => {
    const key = process.env.RENDER_API_KEY;
    const srv = process.env.RENDER_SERVICE_ID;
    if (!key || !srv) return resolve(false);

    const req = https.request({
      method: 'POST',
      hostname: 'api.render.com',
      path: `/v1/services/${srv}/suspend`,
      headers: { Authorization: `Bearer ${key}`, accept: 'application/json' }
    }, (res) => {
      res.resume();
      res.on('end', () => {
        console.log('🔻 Render service suspended (status', res.statusCode, ')');
        resolve(true);
      });
    });
    req.on('error', (e) => {
      console.error('Suspend failed:', e.message);
      resolve(false);
    });
    req.end();
  });
}

// ---- run queue (delegates to runall.cjs) ----
function runOnce() {
  if (isRunning) {
    console.log('ℹ️  run skipped: already running (pid:', lastPid, ')');
    return false;
  }
  const entry = path.join(__dirname, 'runall.cjs');
  console.log('▶ starting:', entry);

  isRunning = true;
  lastError = null;

  const p = spawn(process.execPath, [entry], {
    env: process.env,               // inherit env (important)
    stdio: ['ignore', 'inherit', 'inherit']
  });
  lastPid = p.pid;

  p.on('exit', async (code) => {
    lastRun = new Date().toISOString();
    lastStatus = code === 0 ? 'ALL_OK' : 'HAS_FAIL';
    isRunning = false;
    console.log('🏁 run finished with code', code, '→', lastStatus);

    // Auto-suspend to save free hours
    await suspendService();
  });

  p.on('error', (err) => {
    lastRun = new Date().toISOString();
    lastStatus = 'SPAWN_ERROR';
    lastError = err?.message || String(err);
    isRunning = false;
    console.error('❌ spawn error:', lastError);
  });

  return true;
}

// ---- HTTP server (health + manual run trigger + diag trigger) ----
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (url.pathname === '/' || url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      isRunning,
      lastRun,
      lastStatus,
      lastPid,
      now: new Date().toISOString()
    }));
    return;
  }

  if (url.pathname === '/run') {
    const started = runOnce();
    res.writeHead(started ? 202 : 200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      started,
      isRunning,
      message: started ? 'Run started' : 'Already running'
    }));
    return;
  }

  // /diag endpoint: run scripts/diag.cjs; PASS (0/2) पर runall.cjs ऑटो-स्टार्ट
  if (url.pathname === '/diag') {
    const allowRun = (url.searchParams.get('run') ?? 'auto') !== '0'; // ?run=0 भेजोगे तो auto-run नहीं होगा
    const diag = spawn(process.execPath, [path.join(__dirname, 'scripts', 'diag.cjs')], {
      env: process.env,
      stdio: ['ignore', 'inherit', 'inherit']
    });

    // तुरंत 202 देकर जवाब — logs Render पर stream होंगे
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      started: !!diag.pid,
      pid: diag.pid,
      autoRun: allowRun,
      message: 'diag started; will auto-run on PASS'
    }));

    diag.on('exit', (code) => {
      console.log('🧪 diag exited with code', code);
      // 0 = full pass, 2 = partial pass (e.g., network ok but some warns) → दोनों पर run
      if (allowRun && (code === 0 || code === 2)) {
        const started = runOnce();
        console.log(started ? '▶ runall started after diag' : 'ℹ️ run already in progress');
      } else if (code !== 0 && code !== 2) {
        console.warn('⚠️ diag failed; not starting run.');
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log(`Health server running on port ${PORT}`);
});

// 👇 अगर deploy/resume होते ही job auto-start चाहिए तो इसे ON करें:
// runOnce();

// Manual trigger (/run या /diag) बेहतर है — free hours बचेंगे.