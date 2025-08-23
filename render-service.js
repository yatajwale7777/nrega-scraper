import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

// Your Render API key
const RENDER_API_KEY = process.env.RENDER_API_KEY;

// Replace these with your project/service details
const SERVICE_NAME = "nrega-scraper-temp";
const REGION = "o5"; // example region code
const PLAN = "free"; // free plan
const BRANCH = "main"; // branch of your GitHub repo

async function createService() {
  const res = await fetch("https://api.render.com/v1/services", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RENDER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: SERVICE_NAME,
      type: "web_service",
      repo: "your_github_username/nrega-scraper",
      branch: BRANCH,
      plan: PLAN,
      env: {
        GOOGLE_CREDENTIALS_BASE64: process.env.GOOGLE_CREDENTIALS_BASE64,
        PROXY_SERVER: process.env.PROXY_SERVER,
        PROXY_USER: process.env.PROXY_USER,
        PROXY_PASS: process.env.PROXY_PASS
      },
    }),
  });

  const data = await res.json();
  console.log("Created service:", data);
  return data.id;
}

async function deleteService(serviceId) {
  const res = await fetch(`https://api.render.com/v1/services/${serviceId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${RENDER_API_KEY}`,
    },
  });

  if (res.status === 204) {
    console.log("✅ Service deleted successfully!");
  } else {
    const data = await res.json();
    console.error("❌ Failed to delete service:", data);
  }
}

async function main() {
  const serviceId = await createService();

  console.log("🕐 Waiting for 5 minutes before deleting...");
  setTimeout(async () => {
    await deleteService(serviceId);
  }, 5 * 60 * 1000); // 5 minutes wait
}

main();
