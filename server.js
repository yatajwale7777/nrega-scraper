
// Load environment variables from .env file
require('dotenv').config(); // <-- add this at the very top



const creds = JSON.parse(
  Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, "base64").toString("utf8")
);

const proxyServer = process.env.PROXY_SERVER;
const proxyUser = process.env.PROXY_USER;
const proxyPass = process.env.PROXY_PASS;



const express = require("express");
const { exec } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("🚀 NREGA Scraper is running on Render!");
});

app.get("/run", (req, res) => {
  exec("node runall.cjs", (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Error: ${error.message}`);
      return res.status(500).send("Error running script");
    }
    if (stderr) {
      console.error(`⚠️ Stderr: ${stderr}`);
    }
    console.log(`✅ Script Output:\n${stdout}`);
    res.send(`<pre>${stdout}</pre>`);
  });
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
