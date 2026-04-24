#!/usr/bin/env node
import { Command } from "commander";
import { registerAuthCommand } from "./commands/auth.js";
import { registerResultsCommand } from "./commands/results.js";
import { registerSummaryCommand } from "./commands/summary.js";

const program = new Command();

program
  .name("c2")
  .description("Concept2 Logbook CLI — workout history and progression analysis")
  .version("0.1.0");

registerAuthCommand(program);
registerResultsCommand(program);
registerSummaryCommand(program);

program.parse(process.argv);
