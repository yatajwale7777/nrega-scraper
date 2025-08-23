import fetch from "node-fetch";
import { execSync } from "child_process";

const RENDER_API_KEY = process.env.RENDER_API_KEY;

// 1️⃣ Deploy new service
const servicePayload = {
  name: "nrega-scraper",
  type: "web_service",
  repo: "https://github.com/irfanqureshi/nrega-scraper.git",
  branch: "main",
  plan: "free",
  envVars: [
    { key: "GOOGLE_CREDENTIALS_BASE64", value: process.env.GOOGLE_CREDENTIALS_BASE64 },
    { key: "PROXY_SERVER", value: process.env.PROXY_SERVER || "" },
  ],
};

async function deployService() {
  const res = await fetch("https://api.render.com/v1/services", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RENDER_API_KEY}`,
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify(servicePayload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Deploy failed: ${JSON.stringify(data)}`);
  console.log("✅ Service deployed:", data.id);
  return data.id;
}

// 2️⃣ Run scraper inside the service (locally here for simplicity)
async function runScraper() {
  console.log("🔧 Running scraper...");
  execSync("node labour.cjs", { stdio: "inherit" });
}

// 3️⃣ Delete service after scrape
async function deleteService(serviceId) {
  const res = await fetch(`https://api.render.com/v1/services/${serviceId}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${RENDER_API_KEY}` },
  });
  if (res.status === 204) console.log("✅ Service deleted successfully");
  else console.error("❌ Failed to delete service");
}

(async () => {
  try {
    const serviceId = await deployService();
    await runScraper();
    await deleteService(serviceId);
  } catch (err) {
    console.error("❌ Error:", err);
  }
})();
