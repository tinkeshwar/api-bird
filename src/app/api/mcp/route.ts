import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerTools } from "@/mcp/tools";

// Stateless: a fresh server per request. No connectDB, lib/db.ts connects lazily. Localhost only, see mcp/tools.ts.
async function handle(req: Request) {
  const server = new McpServer({ name: "api-bird", version: "1.0.0" });
  registerTools(server);
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(req);
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
