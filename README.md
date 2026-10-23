# API Bird

A local API workbench. Organise APIs as **projects → services → endpoints**, run requests against them, and let Claude (or any MCP client) do the same over MCP.

- **Projects** hold variables (`{{name}}`, optionally secret) and shared headers.
- **Services** have a base URL and auth (bearer, basic, or API key in header/query).
- **Endpoints** are method + path with headers, query, and body. Import them from an OpenAPI doc (YAML or JSON).
- **Requests** are saved per endpoint and can be replayed. Response values can be captured into variables.

Built with Next.js 16, React 19, Tailwind 4, and MongoDB.

## Setup

Requires Node 20+ and a running MongoDB.

```sh
npm install
cp .env.example .env.local   # set MONGODB_URI
npm run dev -- -H 127.0.0.1
```

Open http://localhost:3000.

## MCP

The app serves an MCP endpoint at `/api/mcp`. Register it with Claude Code:

```sh
claude mcp add api-bird --transport http http://localhost:3000/api/mcp
```

Tools cover listing/reading projects, services, endpoints and saved requests, `run_endpoint`, `run_request`, `import_openapi`, and creating/updating endpoints. Secrets are masked in responses.

> **No auth.** `run_endpoint` makes the server send requests anywhere, so bind to localhost only (`-H 127.0.0.1`).

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint |
| `npm test` | `node --test` on `src/lib` and `src/mcp` |

## Layout

- `src/app/` — routes, server actions (`actions.ts`), MCP route (`api/mcp`)
- `src/app/(app)/dev/` — UI component prototypes
- `src/components/` — UI components
- `src/lib/` — db, variables/auth, OpenAPI parser
- `src/mcp/tools.ts` — MCP tool definitions
