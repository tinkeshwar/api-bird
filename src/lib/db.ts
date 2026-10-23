import { createHash } from "node:crypto";
import { MongoClient, ObjectId, type Db, type WithId } from "mongodb";
import { METHODS } from "./methods.ts";

// Schemas omit _id: the driver adds it on reads (WithId<T>) and generates it on insert.

export type KV = { key: string; value: string };

export type Var = { value: string; secret?: boolean };

export type Project = { name: string; icon?: string; vars?: Record<string, Var>; headers?: KV[]; createdAt: Date };

// Every string field accepts {{vars}}.
export type Auth =
  | { type: "none" }
  | { type: "bearer"; token: string }
  | { type: "basic"; username: string; password: string }
  | { type: "apikey"; in: "header" | "query"; name: string; value: string };

// After a 2xx run, saves a response value into vars[var]. path: PLAIN-view notation (data.token, lines[0].id), or the header name.
export type Capture = { var: string; from: "body" | "header"; path: string };

export type Service = {
  projectId: ObjectId;
  name: string;
  type: "rest";
  protocol: "http" | "https";
  host: string;
  port: number;
  basePath?: string; // "" or "/api/v1": no trailing slash, prepended to every endpoint path
  auth?: Auth; // missing = none; applied to every endpoint unless it sets noAuth
  createdAt: Date;
};

export type Endpoint = {
  serviceId: ObjectId;
  method: string;
  path: string;
  name: string;
  description?: string;
  headers: KV[];
  query: KV[];
  body?: string;
  noAuth?: boolean; // public route: skip the service's auth
  skipHeaders?: string[]; // project header names this endpoint doesn't send
  captures?: Capture[];
  source: "openapi" | "manual";
  createdAt: Date;
};

export type RunInput = {
  method: string;
  path: string;
  params: Record<string, string>;
  query: KV[];
  headers: KV[];
  body: string;
  noAuth?: boolean;
  skipHeaders?: string[];
};

// One per unique request (endpointId + hash) that got an HTTP response; re-running it updates status and lastRunAt.
export type SavedRequest = {
  endpointId: ObjectId;
  hash: string;
  label?: string;
  locked?: boolean; // blocks rename and delete
  input: RunInput;
  status: number;
  statusText: string;
  createdAt: Date;
  lastRunAt: Date;
};

export const hasBody = (method: string) => !["GET", "HEAD"].includes(method.toUpperCase());

// Fingerprint of the request templates (before {{var}} fill). Empty rows, unused params and list order of
// params/skipHeaders don't change it.
export function requestHash(o: RunInput) {
  const inPath = new Set([...o.path.matchAll(/\{\{[^}]*\}\}|\{([^{}]+)\}/g)].flatMap((m) => (m[1] ? [m[1]] : [])));
  const rows = (r: KV[]) => r.filter((x) => x.key.trim()).map((x) => [x.key, x.value]);
  const canon = {
    method: o.method.toUpperCase(),
    path: o.path,
    params: Object.keys(o.params).filter((n) => inPath.has(n)).sort().map((n) => [n, o.params[n]]),
    query: rows(o.query),
    headers: rows(o.headers),
    body: hasBody(o.method) ? o.body : "",
    noAuth: !!o.noAuth,
    skipHeaders: [...(o.skipHeaders ?? [])].sort(),
  };
  return createHash("sha256").update(JSON.stringify(canon)).digest("hex");
}

export const serviceUrl = (s: Pick<Service, "protocol" | "host" | "port" | "basePath">) => `${s.protocol}://${s.host}:${s.port}${s.basePath ?? ""}`;

// "" stays empty; otherwise must start with "/" and hold no whitespace, ? or #. Trailing slashes go. null = invalid.
export function normBasePath(raw: string) {
  const p = raw.trim().replace(/\/+$/, "");
  if (!p) return "";
  return p.startsWith("/") && !/[\s?#]/.test(p) ? p : null;
}

// Editable endpoint fields, as sent by the form or an MCP tool.
export type EndpointInput = Pick<Endpoint, "method" | "path" | "name" | "description" | "body" | "noAuth" | "skipHeaders"> & { headers?: KV[]; query?: KV[] };

// Normalizes and validates; empty body/description come back undefined. Rows with a blank key are dropped.
export function checkEndpoint(e: EndpointInput) {
  const method = String(e.method ?? "").trim().toUpperCase();
  const path = String(e.path ?? "").trim();
  const name = String(e.name ?? "").trim();
  const description = String(e.description ?? "").trim();
  const body = String(e.body ?? "");
  const rows = (r: KV[] = []) => r.map((x) => ({ key: String(x.key).trim(), value: String(x.value ?? "") })).filter((x) => x.key);
  const bad = (error: string) => ({ error });
  if (!METHODS.includes(method)) return bad(`Method must be one of ${METHODS.join(", ")}`);
  if (!path.startsWith("/")) return bad("Path must start with /");
  if (!name) return bad("Name is required");
  return { method, path, name, headers: rows(e.headers), query: rows(e.query), noAuth: !!e.noAuth, skipHeaders: (e.skipHeaders ?? []).map(String), ...(body && { body }), ...(description && { description }) };
}

const g = globalThis as unknown as { _db?: Promise<Db> };

function connect(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  return new MongoClient(uri).connect().then(async (client) => {
    const db = client.db(); // database name from the URI
    await db.collection("services").createIndex({ projectId: 1 });
    await db.collection("endpoints").createIndex({ serviceId: 1, method: 1, path: 1 }, { unique: true });
    await db.collection("requests").createIndex({ endpointId: 1, hash: 1 }, { unique: true });
    return db;
  });
}

// Cached on globalThis so dev hot reload reuses one connection.
// A failed connect is dropped so the next request retries.
function db(): Promise<Db> {
  return (g._db ??= connect().catch((e) => {
    g._db = undefined;
    throw e;
  }));
}

export const projects = async () => (await db()).collection<Project>("projects");
export const services = async () => (await db()).collection<Service>("services");
export const endpoints = async () => (await db()).collection<Endpoint>("endpoints");
export const requests = async () => (await db()).collection<SavedRequest>("requests");

// Invalid hex ids become null so callers can notFound() instead of throwing.
export const oid = (id: string) => (ObjectId.isValid(id) ? new ObjectId(id) : null);

export type Producer = { ep: WithId<Endpoint>; svc: WithId<Service>; via: string };

// var name → endpoints in the project that capture it, newest first (the first one is used to refresh it).
export async function producers(projectId: ObjectId) {
  const svcs = await (await services()).find({ projectId }).toArray();
  const eps = await (await endpoints())
    .find({ serviceId: { $in: svcs.map((s) => s._id) }, "captures.0": { $exists: true } })
    .sort({ createdAt: -1, _id: -1 })
    .toArray();
  const out = new Map<string, Producer[]>();
  for (const ep of eps) {
    const svc = svcs.find((s) => s._id.equals(ep.serviceId))!;
    const p = { ep, svc, via: `${svc.name} › ${ep.name}` };
    for (const c of ep.captures!) out.set(c.var, [...(out.get(c.var) ?? []), p]);
  }
  return out;
}

// Picker warnings for vars that more than one endpoint captures.
export const producerWarnings = (m: Map<string, Producer[]>) =>
  Object.fromEntries([...m].filter(([, ps]) => ps.length > 1).map(([v, ps]) => [v, `${ps.length} endpoints capture this; ${ps[0].via} wins`]));
