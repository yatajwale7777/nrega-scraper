const puppeteer = require("puppeteer");

require('dotenv').config();

require('dotenv').config(); // Load env vars


(async () => {
  try {
    const browser = await puppeteer.launch({

      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        `--proxy-server=${process.env.PROXY_SERVER}` // .env me set karein
      ]

      headless: "new",
      args: [`--proxy-server=${process.env.PROXY_SERVER}`, "--no-sandbox", "--disable-setuid-sandbox"],

    });

    const page = await browser.newPage();


    // Agar proxy authentication chahiye
    if (process.env.PROXY_USER && process.env.PROXY_PASS) {
      await page.authenticate({
        username: process.env.PROXY_USER,
        password: process.env.PROXY_PASS
      });
    }

    await page.goto('https://httpbin.org/ip', { waitUntil: 'domcontentloaded' });

    const ip = await page.evaluate(() => document.body.innerText);
    console.log('✅ Proxy IP is:', ip);

    await browser.close();
  } catch (err) {
    console.error('❌ Error:', err.message);

    // Proxy authentication
    await page.authenticate({
      username: process.env.PROXY_USER,
      password: process.env.PROXY_PASS
    });

    await page.goto("https://httpbin.org/ip", { waitUntil: "domcontentloaded" });

    const ip = await page.evaluate(() => document.body.innerText);
    console.log("✅ Proxy IP is:", ip);

    await browser.close();
  } catch (err) {
    console.error("❌ Error:", err);

  }
})();
