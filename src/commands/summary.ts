import { Command } from "commander";
import { loadConfig, getValidToken } from "../auth.js";
import { fetchResults } from "../api.js";
import type { C2Result } from "../types.js";

function paceToSeconds(tenths: number): number {
  return tenths / 10;
}

function formatPace(tenths: number): string {
  const totalSec = Math.round(tenths / 10);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const frac = tenths % 10;
  return `${min}:${String(sec).padStart(2, "0")}.${frac}/500m`;
}

function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  const monday = new Date(d.setDate(diff));
  return monday.toISOString().slice(0, 10);
}

function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7); // YYYY-MM
}

interface PeriodStats {
  count: number;
  totalDistance: number; // meters
  avgPace: number; // tenths/500m avg
  bestPace: number;
  paces: number[];
}

function computeStats(results: C2Result[]): PeriodStats {
  const paces = results.map(r => r.pace);
  const totalDist = results.reduce((s, r) => s + r.distance, 0);
  const avgPace = paces.reduce((s, p) => s + p, 0) / paces.length;
  const bestPace = Math.min(...paces);
  return { count: results.length, totalDistance: totalDist, avgPace, bestPace, paces };
}

export function registerSummaryCommand(program: Command): void {
  program
    .command("summary")
    .description("Summarize workouts by week or month")
    .option("--type <type>", "Filter by machine: rower, skierg, bikeerg")
    .option("--from <date>", "Start date (YYYY-MM-DD)")
    .option("--to <date>", "End date (YYYY-MM-DD)")
    .option("--by <period>", "Group by: week or month", "month")
    .option("--json", "Output raw JSON")
    .action(async (opts: { type?: string; from?: string; to?: string; by: string; json?: boolean }) => {
      const config = loadConfig();
      if (!config) {
        console.error("❌ Not authenticated. Run: c2 auth login");
        process.exit(1);
      }

      const token = await getValidToken(config);
      const results = await fetchResults(token, {
        type: opts.type as "rower" | "skierg" | "bikeerg" | undefined,
        from: opts.from,
        to: opts.to,
      });

      if (results.length === 0) {
        console.log("No results found.");
        return;
      }

      const groupBy = opts.by === "week" ? getWeekKey : getMonthKey;
      const groups = new Map<string, C2Result[]>();

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
      console.log(`\n  ${label.padEnd(12)}${"Sessions".padEnd(10)}${"Distance".padEnd(12)}${"Avg Pace".padEnd(16)}Best Pace`);
      console.log("  " + "─".repeat(68));

      for (const [period, rows] of sorted) {
        const stats = computeStats(rows);
        const distKm = (stats.totalDistance / 1000).toFixed(1) + "k";
        console.log(
          `  ${period.padEnd(12)}${String(stats.count).padEnd(10)}${distKm.padEnd(12)}${formatPace(Math.round(stats.avgPace)).padEnd(16)}${formatPace(stats.bestPace)}`
        );
      }

      // Overall trend note
      if (sorted.length >= 3) {
        const recent = sorted.slice(-3).map(([, rows]) => computeStats(rows).avgPace);
        const early = sorted.slice(0, 3).map(([, rows]) => computeStats(rows).avgPace);
        const recentAvg = recent.reduce((s, p) => s + p, 0) / recent.length;
        const earlyAvg = early.reduce((s, p) => s + p, 0) / early.length;
        const diff = earlyAvg - recentAvg;
        const trend = diff > 0 ? `↑ ${Math.abs(diff / 10).toFixed(1)}s/500m faster` : diff < 0 ? `↓ ${Math.abs(diff / 10).toFixed(1)}s/500m slower` : "→ no change";
        console.log(`\n  Trend (first 3 vs last 3 periods): ${trend}`);
      }

      console.log(`\n  Total: ${results.length} session(s), ${(results.reduce((s, r) => s + r.distance, 0) / 1000).toFixed(1)}k\n`);
    });
}
