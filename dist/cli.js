#!/usr/bin/env node

// src/cli.ts
import { Command } from "commander";

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

// src/commands/auth.ts
function registerAuthCommand(program2) {
  const auth = program2.command("auth").description("Authenticate with Concept2 Logbook via OAuth");
  auth.command("login").description("Log in to Concept2 Logbook").requiredOption("--client-id <id>", "OAuth client ID").requiredOption("--client-secret <secret>", "OAuth client secret").option("--redirect-uri <uri>", "OAuth redirect URI", "http://localhost/concept2").action(async (opts) => {
    await runAuthFlow(opts.clientId, opts.clientSecret, opts.redirectUri);
  });
  auth.command("status").description("Show current auth status").action(() => {
    const config = loadConfig();
    if (!config) {
      console.log("\u274C Not authenticated. Run: c2 auth login --client-id <id> --client-secret <secret>");
      process.exit(1);
    }
    const expired = Date.now() >= config.expiresAt;
    const expiresIn = Math.round((config.expiresAt - Date.now()) / 1e3 / 60);
    console.log(`\u2705 Authenticated`);
    console.log(`   Token: ${expired ? "\u26A0\uFE0F  expired" : `valid (expires in ~${expiresIn} min)`}`);
    console.log(`   Config: ~/.config/concept2-cli/config.json`);
  });
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

// src/commands/results.ts
function calcPaceTenths(distanceM, timeTenths) {
  if (distanceM === 0) return 0;
  return Math.round(timeTenths / distanceM * 500);
}
function formatPace(tenths) {
  const totalSec = Math.floor(tenths / 10);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const frac = tenths % 10;
  return `${min}:${String(sec).padStart(2, "0")}.${frac}`;
}
function formatTime(tenths) {
  const totalSec = Math.round(tenths / 10);
  const hrs = Math.floor(totalSec / 3600);
  const min = Math.floor(totalSec % 3600 / 60);
  const sec = totalSec % 60;
  const frac = tenths % 10;
  if (hrs > 0) return `${hrs}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${frac}`;
  return `${min}:${String(sec).padStart(2, "0")}.${frac}`;
}
function printResult(r) {
  const dist = r.distance >= 1e3 ? `${(r.distance / 1e3).toFixed(1)}k` : `${r.distance}m`;
  const paceTenths = r.pace ?? calcPaceTenths(r.distance, r.time);
  const pace = formatPace(paceTenths);
  const time = formatTime(r.time);
  const sr = r.stroke_rate ? ` ${r.stroke_rate}spm` : "";
  console.log(`  ${r.date.slice(0, 10)}  ${r.type.padEnd(8)}  ${dist.padEnd(7)}  ${time.padEnd(10)}  ${pace}/500m${sr}`);
}
function registerResultsCommand(program2) {
  program2.command("results").description("List your Concept2 workouts").option("--type <type>", "Filter by machine: rower, skierg, bikeerg").option("--from <date>", "Start date (YYYY-MM-DD)").option("--to <date>", "End date (YYYY-MM-DD)").option("--limit <n>", "Max results to show", "50").option("--json", "Output raw JSON").action(async (opts) => {
    const config = loadConfig();
    if (!config) {
      console.error("\u274C Not authenticated. Run: c2 auth login");
      process.exit(1);
    }
    const token = await getValidToken(config);
    const results = await fetchResults(token, {
      type: opts.type,
      from: opts.from,
      to: opts.to,
      limit: parseInt(opts.limit)
    });
    if (opts.json) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }
    if (results.length === 0) {
      console.log("No results found.");
      return;
    }
    console.log(`
  ${"Date".padEnd(12)}${"Type".padEnd(10)}${"Dist".padEnd(8)}${"Time".padEnd(11)}Pace`);
    console.log("  " + "\u2500".repeat(55));
    for (const r of results) {
      printResult(r);
    }
    console.log(`
  ${results.length} result(s)
`);
  });
}

// src/commands/summary.ts
function formatPace2(tenths) {
  const totalSec = Math.round(tenths / 10);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const frac = tenths % 10;
  return `${min}:${String(sec).padStart(2, "0")}.${frac}/500m`;
}
function getWeekKey(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().slice(0, 10);
}
function getMonthKey(dateStr) {
  return dateStr.slice(0, 7);
}
function calcPaceTenths2(distanceM, timeTenths) {
  if (distanceM === 0) return 0;
  return Math.round(timeTenths / distanceM * 500);
}
function computeStats(results) {
  const paces = results.map((r) => r.pace ?? calcPaceTenths2(r.distance, r.time));
  const totalDist = results.reduce((s, r) => s + r.distance, 0);
  const avgPace = paces.reduce((s, p) => s + p, 0) / paces.length;
  const bestPace = Math.min(...paces);
  return { count: results.length, totalDistance: totalDist, avgPace, bestPace, paces };
}
function registerSummaryCommand(program2) {
  program2.command("summary").description("Summarize workouts by week or month").option("--type <type>", "Filter by machine: rower, skierg, bikeerg").option("--from <date>", "Start date (YYYY-MM-DD)").option("--to <date>", "End date (YYYY-MM-DD)").option("--by <period>", "Group by: week or month", "month").option("--json", "Output raw JSON").action(async (opts) => {
    const config = loadConfig();
    if (!config) {
      console.error("\u274C Not authenticated. Run: c2 auth login");
      process.exit(1);
    }
    const token = await getValidToken(config);
    const results = await fetchResults(token, {
      type: opts.type,
      from: opts.from,
      to: opts.to
    });
    if (results.length === 0) {
      console.log("No results found.");
      return;
    }
    const groupBy = opts.by === "week" ? getWeekKey : getMonthKey;
    const groups = /* @__PURE__ */ new Map();
    for (const r of results) {
      const key = groupBy(r.date);
      const group = groups.get(key) ?? [];
      group.push(r);
      groups.set(key, group);
    }
    const sorted = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
    if (opts.json) {
      const out = sorted.map(([period, rows]) => {
        const stats = computeStats(rows);
        return { period, ...stats };
      });
      console.log(JSON.stringify(out, null, 2));
      return;
    }
    const label = opts.by === "week" ? "Week of" : "Month";
    console.log(`
  ${label.padEnd(12)}${"Sessions".padEnd(10)}${"Distance".padEnd(12)}${"Avg Pace".padEnd(16)}Best Pace`);
    console.log("  " + "\u2500".repeat(68));
    for (const [period, rows] of sorted) {
      const stats = computeStats(rows);
      const distKm = (stats.totalDistance / 1e3).toFixed(1) + "k";
      console.log(
        `  ${period.padEnd(12)}${String(stats.count).padEnd(10)}${distKm.padEnd(12)}${formatPace2(Math.round(stats.avgPace)).padEnd(16)}${formatPace2(stats.bestPace)}`
      );
    }
    if (sorted.length >= 3) {
      const recent = sorted.slice(-3).map(([, rows]) => computeStats(rows).avgPace);
      const early = sorted.slice(0, 3).map(([, rows]) => computeStats(rows).avgPace);
      const recentAvg = recent.reduce((s, p) => s + p, 0) / recent.length;
      const earlyAvg = early.reduce((s, p) => s + p, 0) / early.length;
      const diff = earlyAvg - recentAvg;
      const trend = diff > 0 ? `\u2191 ${Math.abs(diff / 10).toFixed(1)}s/500m faster` : diff < 0 ? `\u2193 ${Math.abs(diff / 10).toFixed(1)}s/500m slower` : "\u2192 no change";
      console.log(`
  Trend (first 3 vs last 3 periods): ${trend}`);
    }
    console.log(`
  Total: ${results.length} session(s), ${(results.reduce((s, r) => s + r.distance, 0) / 1e3).toFixed(1)}k
`);
  });
}

// src/cli.ts
var program = new Command();
program.name("c2").description("Concept2 Logbook CLI \u2014 workout history and progression analysis").version("0.1.0");
registerAuthCommand(program);
registerResultsCommand(program);
registerSummaryCommand(program);
program.parse(process.argv);
//# sourceMappingURL=cli.js.map