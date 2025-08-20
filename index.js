import axios from "axios";
import HttpsProxyAgent from "https-proxy-agent";

const proxyHost = process.env.PROXY_HOST;
const proxyPort = process.env.PROXY_PORT;
const proxyUser = process.env.PROXY_USER;
const proxyPass = process.env.PROXY_PASS;

const proxyUrl = `http://${proxyUser}:${proxyPass}@${proxyHost}:${proxyPort}`;
const agent = new HttpsProxyAgent(proxyUrl);

axios.get("https://httpbin.org/ip", { httpsAgent: agent })
  .then(res => console.log(res.data))
  .catch(err => console.error("Proxy error:", err));
