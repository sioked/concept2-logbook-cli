// src/auth.ts
import fs from "fs";
import path from "path";
import os from "os";
import http from "http";
import { URL } from "url";
var CONFIG_DIR = path.join(os.homedir(), ".config", "concept2-cli");
var CONFIG_FILE = path.join(CONFIG_DIR, "config.json");
var C2_AUTH_URL = "https://log.concept2.com/oauth/authorize";
var C2_TOKEN_URL = "https://log.concept2.com/oauth/access_token";
var SCOPES = "user:read,results:read";
function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return null;
  }
}
function saveConfig(config) {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 448 });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 384 });
}
function isTokenExpired(config) {
  return Date.now() >= config.expiresAt - 6e4;
}
async function refreshAccessToken(config) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: config.refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret
  });
  const res = await fetch(C2_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const updated = {
    ...config,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? config.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1e3
  };
  saveConfig(updated);
  return updated;
}
async function getValidToken(config) {
  if (isTokenExpired(config)) {
    const refreshed = await refreshAccessToken(config);
    return refreshed.accessToken;
  }
  return config.accessToken;
}
async function runAuthFlow(clientId, clientSecret, redirectUri) {
  const parsed = new URL(redirectUri);
  const port = parseInt(parsed.port || "80");
  const callbackPath = parsed.pathname;
  const authUrl = `${C2_AUTH_URL}?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(SCOPES)}`;
  console.log("\n\u{1F510} Concept2 OAuth Login\n");
  console.log("Open this URL in your browser:\n");
  console.log(authUrl);
  console.log("\nWaiting for authorization callback...\n");
  const code = await waitForCode(port, callbackPath);
  const tokens = await exchangeCode(code, clientId, clientSecret, redirectUri);
  const config = {
    clientId,
    clientSecret,
    redirectUri,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1e3
  };
  saveConfig(config);
  console.log("\u2705 Authenticated successfully. Config saved to", CONFIG_FILE);
}
function waitForCode(port, callbackPath) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://localhost:${port}`);
      if (url.pathname !== callbackPath) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const code = url.searchParams.get("code");
      if (!code) {
        res.writeHead(400);
        res.end("Missing code");
        reject(new Error("Missing code in callback"));
        server.close();
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<h1>\u2705 Authorization successful! You can close this tab.</h1>");
      server.close();
      resolve(code);
    });
    server.listen(port, () => {
    });
    server.on("error", reject);
  });
}
async function exchangeCode(code, clientId, clientSecret, redirectUri) {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri
  });
  const res = await fetch(C2_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString()
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

// src/api.ts
var BASE_URL = "https://log.concept2.com/api";
async function apiFetch(path2, token) {
  const res = await fetch(`${BASE_URL}${path2}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.c2logbook.v1+json"
    }
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  return res.json();
}
async function fetchResults(token, filter = {}) {
  const all = [];
  let page = 1;
  const perPage = 100;
  const maxResults = filter.limit ?? Infinity;
  while (all.length < maxResults) {
    const params = new URLSearchParams({ page: String(page), number: String(perPage) });
    if (filter.type) params.set("type", filter.type);
    if (filter.from) params.set("from", filter.from);
    if (filter.to) params.set("to", filter.to);
    const data = await apiFetch(`/users/me/results?${params}`, token);
    all.push(...data.data);
    if (page >= data.meta.pagination.total_pages) break;
    page++;
  }
  return filter.limit ? all.slice(0, filter.limit) : all;
}
export {
  fetchResults,
  getValidToken,
  isTokenExpired,
  loadConfig,
  refreshAccessToken,
  runAuthFlow,
  saveConfig
};
//# sourceMappingURL=index.js.map