
const { google } = require('googleapis');

// Make sure you have set the env variable correctly:
// GOOGLE_CREDENTIALS_BASE64 contains the Base64 of the JSON key
if (!process.env.GOOGLE_CREDENTIALS_BASE64) {
  throw new Error("❌ GOOGLE_CREDENTIALS_BASE64 not found");
}

const keyFileJson = JSON.parse(
  Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf-8')
);

const auth = new google.auth.GoogleAuth({
  credentials: keyFileJson,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

module.exports = auth;

// creds.js
const { google } = require("googleapis");

const creds = JSON.parse(
  Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, "base64").toString("utf8")
);

const auth = new google.auth.JWT(
  creds.client_email,
  null,
  creds.private_key,
  ["https://www.googleapis.com/auth/spreadsheets"]
);

module.exports = auth;


