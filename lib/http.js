// lib/http.js
const axios = require('axios');

// axios by default env variables HTTP_PROXY / HTTPS_PROXY को support करता है
// अगर आपने इन्हें secrets में सेट किया है तो सीधे काम करेंगे

module.exports = axios.create({});
