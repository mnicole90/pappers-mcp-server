# Pappers MCP Server

[![npm version](https://img.shields.io/npm/v/@mnicole-dev/pappers-mcp-server.svg)](https://www.npmjs.com/package/@mnicole-dev/pappers-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

MCP (Model Context Protocol) server for the [Pappers API](https://www.pappers.fr/api) — official information about French companies (SIREN / SIRET / financial data / officers / public records).

Lets an MCP client (Claude Desktop, Claude Code, Cursor, etc.) search and fetch up-to-date legal and financial data on French entities.

## Installation

No install needed — run on demand via `npx`. The MCP client launches it as a child process and pipes JSON-RPC over stdio.

## Configuration

One environment variable required :

| Variable | Description |
|----------|-------------|
| `PAPPERS_API_TOKEN` | API key from your Pappers account (see [pappers.fr/api](https://www.pappers.fr/api)) |

### Claude Code (or Claude Desktop)

Edit your MCP servers configuration (`~/.claude.json` for Claude Code, `~/Library/Application Support/Claude/claude_desktop_config.json` for Claude Desktop) and add :

```json
{
  "mcpServers": {
    "pappers": {
      "command": "npx",
      "args": ["-y", "@mnicole-dev/pappers-mcp-server"],
      "env": {
        "PAPPERS_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

Restart your MCP client.

### Cursor

Add to `.cursor/mcp.json` (project-level) or global Cursor settings :

```json
{
  "mcpServers": {
    "pappers": {
      "command": "npx",
      "args": ["-y", "@mnicole-dev/pappers-mcp-server"],
      "env": {
        "PAPPERS_API_TOKEN": "your-api-token"
      }
    }
  }
}
```

## Available tools

| Tool | Description |
|------|-------------|
| `search-company` | Search for French companies by name, SIREN or SIRET |
| `get-company` | Fetch detailed info on a company (legal form, officers, address, activity codes) |
| `get-finances` | Fetch up to 3 years of financial statements (revenue, net profit, equity, headcount) |
| `get-dirigeants` | List active officers and directors of a company |
| `search-dirigeant` | Search for officers by name |

All tools accept friendly arguments validated via [Zod](https://github.com/colinhacks/zod).

## Local development

```bash
git clone https://github.com/mnicole90/pappers-mcp-server.git
cd pappers-mcp-server
npm install
npm run build
```

To run locally with an MCP client during development :

```bash
node dist/index.js
```

The server communicates over stdio.

## API rate limits

Pappers free tier : 100 requests / day.

Paid plans give higher quotas — see [pappers.fr/api/tarifs](https://www.pappers.fr/api/tarifs).

## License

MIT — see [LICENSE](LICENSE).

## Author

[Maxime Nicole](https://github.com/mnicole90) — [KodeSaaS](https://kodesaas.com)
