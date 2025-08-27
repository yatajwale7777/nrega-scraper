// lib/http.js
const axios = require('axios');
const http = require('http');
const https = require('https');

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 20, family: 4 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 20, family: 4 });

const client = axios.create({
  timeout: 90000, // 90s
  httpAgent,
  httpsAgent,
  maxRedirects: 3,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36'
  },
  validateStatus: s => s >= 200 && s < 400
});

module.exports = client;