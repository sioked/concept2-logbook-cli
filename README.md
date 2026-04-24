# concept2-logbook-cli

An unofficial CLI for the [Concept2 Logbook API](https://log.concept2.com/developers/documentation/). Pull your rowing, skiing, and biking workout history, analyze pace and heart rate trends, and summarize training over time.

Built with TypeScript and Node.js.

## Features

- **`c2 results`** — List workouts with date, distance, time, pace, stroke rate
- **`c2 summary`** — Aggregate by week or month with avg/best pace and trend analysis
- **`c2 auth`** — OAuth 2.0 authentication with token storage and auto-refresh

## Requirements

- Node.js 18+
- A [Concept2 Logbook](https://log.concept2.com) account
- A Concept2 API application (register at [log.concept2.com/developers](https://log.concept2.com/developers))

## Installation

```bash
git clone https://github.com/sioked/concept2-logbook-cli
cd concept2-logbook-cli
npm install --include=dev
npm run build
```

## Authentication

Register an application at [log.concept2.com/developers](https://log.concept2.com/developers) to get a client ID and secret. Set your redirect URI to `http://localhost:8080/callback` (or any localhost URL).

```bash
node dist/cli.js auth login \
  --client-id YOUR_CLIENT_ID \
  --client-secret YOUR_CLIENT_SECRET \
  --redirect-uri http://localhost:8080/callback
```

This will print an authorization URL. Open it in your browser, approve access, and paste the redirect URL back when prompted.

## Usage

```bash
# List recent workouts
node dist/cli.js results
node dist/cli.js results --limit 100
node dist/cli.js results --type rower --from 2025-01-01

# Monthly summary with trend
node dist/cli.js summary
node dist/cli.js summary --by week
node dist/cli.js summary --type rower --from 2024-01-01

# JSON output for scripting
node dist/cli.js results --json
node dist/cli.js summary --json
```

## License

MIT
