const { google } = require("googleapis");

if (!process.env.GOOGLE_CREDENTIALS_BASE64) {
  throw new Error("❌ GOOGLE_CREDENTIALS_BASE64 not found");
}

const keyFileJson = JSON.parse(
  Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, "base64").toString("utf-8")
);

const auth = new google.auth.GoogleAuth({
  credentials: keyFileJson,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

module.exports = auth;