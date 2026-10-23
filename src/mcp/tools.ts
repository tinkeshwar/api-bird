import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { endpoints, oid, projects, requests, serviceUrl, services, type Auth, type KV, type RunInput, type Var } from "../lib/db.ts";

// ponytail: no auth. Run the app on localhost only (`next dev -H 127.0.0.1`): run_endpoint makes the server
// send requests anywhere. Register with: claude mcp add api-bird --transport http http://localhost:3000/api/mcp

const ok = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });

// Hides a value unless it's empty or a pure {{var}} ref.
export const mask = (s: string) => (!s || /^\{\{[A-Za-z_][\w-]*\}\}$/.test(s) ? s : "••••");

export const maskVars = (vars: Record<string, Var> = {}) =>
  Object.fromEntries(Object.entries(vars).map(([n, v]) => [n, v.secret ? { ...v, value: mask(v.value) } : v]));

export const maskAuth = (auth?: Auth) =>
  auth && (Object.fromEntries(Object.entries(auth).map(([k, v]) => [k, ["token", "password", "value"].includes(k) ? mask(v) : v])) as Auth);

const id = (s: string, what: string) => {
  const o = oid(s);
  if (!o) throw new Error(`${what} not found`);
  return o;
};
const found = <T>(doc: T | null, what: string) => {
  if (!doc) throw new Error(`${what} not found`);
  return doc;
};

// Overrides replace rows with the same key (any case) and add the rest.
const over = (rows: KV[], o: Record<string, string> = {}) => [
  ...rows.filter((r) => !Object.keys(o).some((k) => k.toLowerCase() === r.key.toLowerCase())),
  ...Object.entries(o).map(([key, value]) => ({ key, value })),
];

const rec = z.record(z.string(), z.string());
const rows = z.array(z.object({ key: z.string(), value: z.string() }));
const endpointFields = {
  description: z.string().optional(),
  headers: rows.optional(),
  query: rows.optional(),
  body: z.string().optional(),
  noAuth: z.boolean().optional(),
  skipHeaders: z.array(z.string()).optional().describe("Project header names this endpoint doesn't send"),
};

export function registerTools(server: McpServer) {
  // Imported lazily: actions.ts pulls in next/cache, which `node --test` can't load.
  const actions = () => import("@/app/actions");
  const run = async (endpointId: string, input: RunInput) => ok(await (await actions()).runEndpoint(endpointId, input));
  const result = (r: { error?: string; message?: string }) => {
    if (r.error) throw new Error(r.error);
    return ok(r.message ?? "Done");
  };

  server.registerTool("list_projects", { description: "List projects with their variable names" }, async () =>
    ok((await (await projects()).find({}, { projection: { name: 1, vars: 1 } }).toArray()).map((p) => ({ _id: p._id, name: p.name, vars: Object.keys(p.vars ?? {}) }))),
  );

  server.registerTool("get_project", { description: "Get a project with its variables (secrets masked) and headers", inputSchema: { id: z.string() } }, async (a) => {
    const p = found(await (await projects()).findOne({ _id: id(a.id, "Project") }, { projection: { icon: 0 } }), "Project");
    return ok({ ...p, vars: maskVars(p.vars) });
  });

  server.registerTool("list_services", { description: "List a project's services with their base URL (auth secrets masked)", inputSchema: { projectId: z.string() } }, async (a) =>
    ok((await (await services()).find({ projectId: id(a.projectId, "Project") }).toArray()).map((s) => ({ ...s, url: serviceUrl(s), auth: maskAuth(s.auth) }))),
  );

  server.registerTool("list_endpoints", { description: "List a service's endpoints", inputSchema: { serviceId: z.string() } }, async (a) =>
    ok(await (await endpoints()).find({ serviceId: id(a.serviceId, "Service") }).toArray()),
  );

  server.registerTool("get_endpoint", { description: "Get an endpoint", inputSchema: { id: z.string() } }, async (a) =>
    ok(found(await (await endpoints()).findOne({ _id: id(a.id, "Endpoint") }), "Endpoint")),
  );

  server.registerTool("list_requests", { description: "List an endpoint's saved requests, most recently run first", inputSchema: { endpointId: z.string() } }, async (a) =>
    ok(await (await requests()).find({ endpointId: id(a.endpointId, "Endpoint") }).sort({ lastRunAt: -1 }).toArray()),
  );

  server.registerTool(
    "run_endpoint",
    {
      description: "Run an endpoint with its saved defaults. params fill {path} params; query/headers replace same-named rows; body replaces the body.",
      inputSchema: { endpointId: z.string(), params: rec.optional(), query: rec.optional(), headers: rec.optional(), body: z.string().optional() },
    },
    async (a) => {
      const ep = found(await (await endpoints()).findOne({ _id: id(a.endpointId, "Endpoint") }), "Endpoint");
      return run(a.endpointId, {
        method: ep.method,
        path: ep.path,
        params: a.params ?? {},
        query: over(ep.query, a.query),
        headers: over(ep.headers, a.headers),
        body: a.body ?? ep.body ?? "",
        noAuth: ep.noAuth,
        skipHeaders: ep.skipHeaders,
      });
    },
  );

  server.registerTool("run_request", { description: "Replay a saved request", inputSchema: { requestId: z.string() } }, async (a) => {
    const r = found(await (await requests()).findOne({ _id: id(a.requestId, "Request") }), "Request");
    return run(String(r.endpointId), r.input);
  });

  // No delete tools: the delete actions redirect().

  server.registerTool(
    "import_openapi",
    { description: "Import endpoints from an OpenAPI document (YAML or JSON text). Existing method+path pairs are left untouched.", inputSchema: { serviceId: z.string(), spec: z.string() } },
    async (a) => result(await (await actions()).importSpec(a.serviceId, a.spec)),
  );

  server.registerTool(
    "create_endpoint",
    { description: "Create an endpoint in a service", inputSchema: { serviceId: z.string(), method: z.string(), path: z.string(), name: z.string(), ...endpointFields } },
    async ({ serviceId, ...e }) => result(await (await actions()).addEndpoint(serviceId, e)),
  );

  server.registerTool(
    "update_endpoint",
    {
      description: "Update an endpoint. Omitted fields keep their current value; pass \"\" to clear body or description.",
      inputSchema: { id: z.string(), method: z.string().optional(), path: z.string().optional(), name: z.string().optional(), ...endpointFields },
    },
    async ({ id: epId, ...e }) => {
      const ep = found(await (await endpoints()).findOne({ _id: id(epId, "Endpoint") }), "Endpoint");
      const set = Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined));
      return result(await (await actions()).editEndpoint(epId, { ...ep, ...set }));
    },
  );
}
