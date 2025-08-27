// lib/http.js
const axios = require('axios');
const http = require('http');
const https = require('https');

const httpAgent = new http.Agent({ keepAlive: false, timeout: 90_000 });
const httpsAgent = new https.Agent({ keepAlive: false, timeout: 90_000 });

const instance = axios.create({
  // अगर proxy env दिए हैं तो axios खुद उठा लेता है (HTTP_PROXY / HTTPS_PROXY)
  timeout: 90_000,
  maxRedirects: 3,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
    'Connection': 'close'
  },
  httpAgent,
  httpsAgent,
  validateStatus: s => s >= 200 && s < 400
});

module.exports = instance;