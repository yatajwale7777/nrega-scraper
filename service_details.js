// service_details.js
export const SHEET_ID = "1vi-z__fFdVhUZr3PEDjhM83kqhFtbJX0Ejcfu9M8RKo";  // aapka Google Sheet ID

export const SHEET_RANGE = "Sheet1!A1"; // default range

export const GOOGLE_CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
export const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');
