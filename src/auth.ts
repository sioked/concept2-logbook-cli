import fs from "fs";
import path from "path";
import os from "os";
import http from "http";
import { URL } from "url";
import type { TokenConfig } from "./types.js";

const CONFIG_DIR = path.join(os.homedir(), ".config", "concept2-cli");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

const C2_AUTH_URL = "https://log.concept2.com/oauth/authorize";
const C2_TOKEN_URL = "https://log.concept2.com/oauth/access_token";
const SCOPES = "user:read,results:read";

export function loadConfig(): TokenConfig | null {
  if (!fs.existsSync(CONFIG_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8")) as TokenConfig;
  } catch {
    return null;
  }
}

export function saveConfig(config: TokenConfig): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), { mode: 0o600 });
}

export function isTokenExpired(config: TokenConfig): boolean {
  return Date.now() >= config.expiresAt - 60_000; // refresh 1 min early
}

export async function refreshAccessToken(config: TokenConfig): Promise<TokenConfig> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: config.refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret,
  });

  const res = await fetch(C2_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);

  const data = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
  const updated: TokenConfig = {
    ...config,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? config.refreshToken,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  saveConfig(updated);
  return updated;
}

export async function getValidToken(config: TokenConfig): Promise<string> {
  if (isTokenExpired(config)) {
    const refreshed = await refreshAccessToken(config);
    return refreshed.accessToken;
  }
  return config.accessToken;
}

export async function runAuthFlow(clientId: string, clientSecret: string, redirectUri: string): Promise<void> {
  // Parse the redirect URI to get port for local server
  const parsed = new URL(redirectUri);
  const port = parseInt(parsed.port || "80");
  const callbackPath = parsed.pathname;

  const authUrl = `${C2_AUTH_URL}?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(SCOPES)}`;

  console.log("\n🔐 Concept2 OAuth Login\n");
  console.log("Open this URL in your browser:\n");
  console.log(authUrl);
  console.log("\nWaiting for authorization callback...\n");

  const code = await waitForCode(port, callbackPath);
  const tokens = await exchangeCode(code, clientId, clientSecret, redirectUri);

  const config: TokenConfig = {
    clientId,
    clientSecret,
    redirectUri,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: Date.now() + tokens.expires_in * 1000,
  };

  saveConfig(config);
  console.log("✅ Authenticated successfully. Config saved to", CONFIG_FILE);
}

function waitForCode(port: number, callbackPath: string): Promise<string> {
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
      res.end("<h1>✅ Authorization successful! You can close this tab.</h1>");
      server.close();
      resolve(code);
    });

    server.listen(port, () => {
      // server running
    });

    server.on("error", reject);
  });
}

async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  const res = await fetch(C2_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{ access_token: string; refresh_token: string; expires_in: number }>;
}
