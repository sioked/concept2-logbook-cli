import { Command } from "commander";
import { loadConfig, getValidToken } from "../auth.js";
import { fetchResults } from "../api.js";
import type { C2Result } from "../types.js";

function calcPaceTenths(distanceM: number, timeTenths: number): number {
  // pace = time per 500m in tenths of seconds
  if (distanceM === 0) return 0;
  return Math.round((timeTenths / distanceM) * 500);
}

function formatPace(tenths: number): string {
  const totalSec = Math.floor(tenths / 10);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const frac = tenths % 10;
  return `${min}:${String(sec).padStart(2, "0")}.${frac}`;
}

function formatTime(tenths: number): string {
  const totalSec = Math.round(tenths / 10);
  const hrs = Math.floor(totalSec / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;
  const frac = tenths % 10;
  if (hrs > 0) return `${hrs}:${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${frac}`;
  return `${min}:${String(sec).padStart(2, "0")}.${frac}`;
}

function printResult(r: C2Result): void {
  const dist = r.distance >= 1000 ? `${(r.distance / 1000).toFixed(1)}k` : `${r.distance}m`;
  const paceTenths = r.pace ?? calcPaceTenths(r.distance, r.time);
  const pace = formatPace(paceTenths);
  const time = formatTime(r.time);
  const sr = r.stroke_rate ? ` ${r.stroke_rate}spm` : "";
  console.log(`  ${r.date.slice(0,10)}  ${r.type.padEnd(8)}  ${dist.padEnd(7)}  ${time.padEnd(10)}  ${pace}/500m${sr}`);
}

export function registerResultsCommand(program: Command): void {
  program
    .command("results")
    .description("List your Concept2 workouts")
    .option("--type <type>", "Filter by machine: rower, skierg, bikeerg")
    .option("--from <date>", "Start date (YYYY-MM-DD)")
    .option("--to <date>", "End date (YYYY-MM-DD)")
    .option("--limit <n>", "Max results to show", "50")
    .option("--json", "Output raw JSON")
    .action(async (opts: { type?: string; from?: string; to?: string; limit: string; json?: boolean }) => {
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
        limit: parseInt(opts.limit),
      });

      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      if (results.length === 0) {
        console.log("No results found.");
        return;
      }

      console.log(`\n  ${"Date".padEnd(12)}${"Type".padEnd(10)}${"Dist".padEnd(8)}${"Time".padEnd(11)}Pace`);
      console.log("  " + "─".repeat(55));
      for (const r of results) {
        printResult(r);
      }
      console.log(`\n  ${results.length} result(s)\n`);
    });
}
