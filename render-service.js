import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

// Your Render API key
const RENDER_API_KEY = process.env.RENDER_API_KEY;
const OWNER_ID = process.env.RENDER_OWNER_ID; // <-- Add this

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
      ownerId: OWNER_ID, // <-- Add here
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

// rest of code remains same
