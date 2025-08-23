import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

// Environment variables from .env
const RENDER_API_KEY = process.env.RENDER_API_KEY;
const OWNER_ID = process.env.RENDER_OWNER_ID; // Render owner ID

// Service configuration
const SERVICE_NAME = "nrega-scraper-temp";
const REGION = "o5"; // Example region code
const PLAN = "free"; // Plan type
const BRANCH = "main"; // GitHub branch

async function createService() {
  try {
    const res = await fetch("https://api.render.com/v1/services", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RENDER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: SERVICE_NAME,
        type: "web_service",
        ownerId: OWNER_ID,               // Owner ID must be included
        repo: "yatajwale7777/nrega-scraper", // <-- Replace with your GitHub username
        branch: BRANCH,
        plan: PLAN,
        serviceDetails: {
          env: "node",
          region: REGION,
        },
        env: {
          GOOGLE_CREDENTIALS_BASE64: process.env.GOOGLE_CREDENTIALS_BASE64,
          PROXY_SERVER: process.env.PROXY_SERVER,
          PROXY_USER: process.env.PROXY_USER,
          PROXY_PASS: process.env.PROXY_PASS
        },
      }),
    });

    const data = await res.json();
    console.log("✅ Created service:", data);
    return data.id;
  } catch (error) {
    console.error("❌ Error creating service:", error);
  }
}

async function main() {
  const serviceId = await createService();
  console.log("Service ID:", serviceId);
}

main();
