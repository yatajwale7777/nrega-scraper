// server.cjs
const http = require('http');
const { spawn } = require('child_process');

const PORT = process.env.PORT || 3000;
let lastRun = 'never';
let lastStatus = 'unknown';

// Boot पर runall.cjs execute करो
function runOnce() {
  const p = spawn(process.execPath, ['runall.cjs'], { stdio: 'inherit' });
  p.on('exit', (code) => {
    lastRun = new Date().toISOString();
    lastStatus = code === 0 ? 'ALL_OK' : 'HAS_FAIL';
  });
}
runOnce();

// Health endpoint ताकि Render को लगे service चल रही है
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(`OK | lastRun=${lastRun} | status=${lastStatus}\n`);
}).listen(PORT, () => {
  console.log(`Health server running on port ${PORT}`);
});
