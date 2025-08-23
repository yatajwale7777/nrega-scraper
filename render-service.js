import fetch from "node-fetch";
import dotenv from "dotenv";
dotenv.config();

const RENDER_API_KEY = process.env.RENDER_API_KEY;
const OWNER_ID = process.env.RENDER_OWNER_ID; // <- Add this

const SERVICE_NAME = "nrega-scraper-temp";
const REGION = "o5";
const PLAN = "free";
const BRANCH = "main";

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
      ownerId: OWNER_ID,   // <- include here
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

async function main() {
  const serviceId = await createService();
  console.log("Service ID:", serviceId);
}

main();
