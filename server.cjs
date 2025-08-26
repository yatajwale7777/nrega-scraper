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

  // 👇 नया /diag endpoint (remote diag script चलाने के लिए)
  if (url.pathname === '/diag') {
    const started = spawn(process.execPath, [path.join(__dirname, 'scripts', 'diag.cjs')], {
      env: process.env,
      stdio: ['ignore', 'inherit', 'inherit']
    });
    res.writeHead(202, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      started: !!started.pid,
      message: 'diag started',
      pid: started.pid
    }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});
