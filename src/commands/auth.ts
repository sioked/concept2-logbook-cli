import { Command } from "commander";
import { loadConfig, runAuthFlow } from "../auth.js";

export function registerAuthCommand(program: Command): void {
  const auth = program
    .command("auth")
    .description("Authenticate with Concept2 Logbook via OAuth");

  auth
    .command("login")
    .description("Log in to Concept2 Logbook")
    .requiredOption("--client-id <id>", "OAuth client ID")
    .requiredOption("--client-secret <secret>", "OAuth client secret")
    .option("--redirect-uri <uri>", "OAuth redirect URI", "http://localhost/concept2")
    .action(async (opts: { clientId: string; clientSecret: string; redirectUri: string }) => {
      await runAuthFlow(opts.clientId, opts.clientSecret, opts.redirectUri);
    });

  auth
    .command("status")
    .description("Show current auth status")
    .action(() => {
      const config = loadConfig();
      if (!config) {
        console.log("❌ Not authenticated. Run: c2 auth login --client-id <id> --client-secret <secret>");
        process.exit(1);
      }
      const expired = Date.now() >= config.expiresAt;
      const expiresIn = Math.round((config.expiresAt - Date.now()) / 1000 / 60);
      console.log(`✅ Authenticated`);
      console.log(`   Token: ${expired ? "⚠️  expired" : `valid (expires in ~${expiresIn} min)`}`);
      console.log(`   Config: ~/.config/concept2-cli/config.json`);
    });
}
