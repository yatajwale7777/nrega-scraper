import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config(); // Must be first

// Environment variables from .env
const RENDER_API_KEY = process.env.RENDER_API_KEY;
const OWNER_ID = process.env.RENDER_OWNER_ID; // Render owner ID

console.log("RENDER_API_KEY:", RENDER_API_KEY);
console.log("OWNER_ID:", OWNER_ID);

// Service configuration
const SERVICE_NAME = "nrega-scraper-temp";
const REGION = "oregon"; // Valid Render region
const PLAN = "free";     // Plan type
const BRANCH = "main";   // GitHub branch

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
        ownerId: OWNER_ID,  
        repo: "https://github.com/yatajwale7777/nrega-scraper", 
        branch: BRANCH,
        plan: PLAN,
        serviceDetails: {
          env: "node",
          region: REGION,
          envSpecificDetails: {
            version: "22",                // Node.js version
            buildCommand: "npm install",  // <-- ye add karna jaruri hai
            startCommand: "node runall.cjs" // Entry point
          }
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
