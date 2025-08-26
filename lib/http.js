// lib/http.js
const axios = require("axios");

// Default client with sane timeouts + proxy via env (axios supports HTTP_PROXY/HTTPS_PROXY already)
const instance = axios.create({
  timeout: 60000, // 60s global timeout
  maxRedirects: 5,
  // validateStatus: null  // → सभी status लौटाने के लिए uncomment करें
});

// --- Interceptors for logging + retries ---
// (lightweight: सिर्फ़ नेटवर्क errors/5xx retry होंगे)
instance.interceptors.response.use(
  res => res,
  async err => {
    const cfg = err.config || {};
    cfg._retryCount = cfg._retryCount || 0;

    // retry only network errors or 5xx
    const retryable =
      err.code === "ECONNRESET" ||
      err.code === "ETIMEDOUT" ||
      err.code === "EAI_AGAIN" ||
      (err.response && err.response.status >= 500);

    if (retryable && cfg._retryCount < 2) {
      cfg._retryCount++;
      const backoff = 1000 * cfg._retryCount * cfg._retryCount; // 1s, 4s
      console.warn(`[HTTP] retry ${cfg._retryCount} for ${cfg.url} after ${backoff}ms`);
      await new Promise(r => setTimeout(r, backoff));
      return instance(cfg); // retry
    }

    return Promise.reject(err);
  }
);

module.exports = instance;
