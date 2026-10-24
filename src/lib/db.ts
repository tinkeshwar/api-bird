import { createHash } from "node:crypto";
import { join } from "node:path";
import Datastore from "@seald-io/nedb";
import { MongoClient, ObjectId, type Collection, type Document, type WithId } from "mongodb";
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

// The part of mongodb's Db the app uses; NeDB mode fills it with the adapter below.
type Store = { collection<T extends Document>(name: string): Collection<T> };

const g = globalThis as unknown as { _db?: Promise<Store> };

const INDEXES: [string, Record<string, 1>, { unique?: boolean }?][] = [
  ["services", { projectId: 1 }],
  ["endpoints", { serviceId: 1, method: 1, path: 1 }, { unique: true }],
  ["requests", { endpointId: 1, hash: 1 }, { unique: true }],
];

async function connect(): Promise<Store> {
  const uri = process.env.MONGODB_URI;
  const dir = process.env.DATA_DIR;
  const db: Store = uri ? (await new MongoClient(uri).connect()).db() /* database name from the URI */ : dir ? await nedb(dir) : fail();
  for (const [name, keys, opts] of INDEXES) await db.collection(name).createIndex(keys, opts);
  return db;
}

const fail = (): never => {
  throw new Error("Set MONGODB_URI (MongoDB) or DATA_DIR (built-in storage)");
};

// ---------- NeDB adapter: just the Collection calls the app makes ----------

// NeDB stores ids as hex strings; these fields come back as ObjectId so .equals() and oid() work in both modes.
const ID_FIELDS = ["_id", "projectId", "serviceId", "endpointId"];

type Doc = Record<string, unknown>;

// ObjectIds anywhere (docs, filters, $in lists, update operators) → hex strings.
const toStore = (v: unknown): any =>
  v instanceof ObjectId ? v.toHexString()
  : Array.isArray(v) ? v.map(toStore)
  : v && typeof v === "object" && !(v instanceof Date) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toStore(x)]))
  : v;

const fromStore = (d: Doc | null) => {
  if (!d) return null;
  for (const k of ID_FIELDS) if (typeof d[k] === "string") d[k] = new ObjectId(d[k] as string);
  return d;
};

// NeDB's unique error → Mongo's duplicate key code, which isDup checks.
const dupAware = async <T>(p: Promise<T>) => {
  try {
    return await p;
  } catch (e) {
    if ((e as { errorType?: string }).errorType === "uniqueViolated") throw Object.assign(new Error((e as Error).message), { code: 11000 });
    throw e;
  }
};

// NeDB has no $setOnInsert: upserts find first, then insert filter + $setOnInsert + other operators, or update with the other operators.
async function upsert(ds: Datastore, filter: Doc, update: Doc) {
  const { $setOnInsert, ...rest } = update as { $setOnInsert?: Doc };
  const found = (await ds.findOneAsync(filter)) as Doc | null;
  const ops = Object.keys(rest).length ? rest : null;
  if (found) {
    if (ops) await dupAware(ds.updateAsync({ _id: found._id }, ops, {}));
    return { _id: found._id as string, inserted: false };
  }
  const _id = new ObjectId().toHexString();
  await dupAware(ds.insertAsync({ ...filter, ...$setOnInsert, _id }));
  if (ops) await dupAware(ds.updateAsync({ _id }, ops, {}));
  return { _id, inserted: true };
}

function collection(ds: Datastore) {
  const find = (q: Doc = {}, o?: { projection?: Doc }) => {
    const c = ds.findAsync(toStore(q), o?.projection ?? {});
    const cursor = {
      sort: (s: Doc) => (c.sort(s), cursor),
      limit: (n: number) => (c.limit(n), cursor),
      toArray: async () => ((await c) as Doc[]).map(fromStore),
    };
    return cursor;
  };
  const findOne = async (q: Doc, o?: { projection?: Doc }) => fromStore((await ds.findOneAsync(toStore(q), o?.projection ?? {})) as Doc | null);
  return {
    find,
    findOne,
    insertOne: async (doc: Doc) => {
      const d = await dupAware(ds.insertAsync({ ...toStore(doc), _id: new ObjectId().toHexString() }));
      return { insertedId: new ObjectId(d._id) };
    },
    updateOne: async (q: Doc, u: Doc) => ({ matchedCount: (await dupAware(ds.updateAsync(toStore(q), toStore(u), {}))).numAffected }),
    deleteOne: async (q: Doc) => ({ deletedCount: await ds.removeAsync(toStore(q), {}) }),
    deleteMany: async (q: Doc) => ({ deletedCount: await ds.removeAsync(toStore(q), { multi: true }) }),
    countDocuments: (q: Doc = {}) => ds.countAsync(toStore(q)),
    estimatedDocumentCount: () => ds.countAsync({}),
    findOneAndDelete: async (q: Doc) => {
      const d = await findOne(q);
      if (d) await ds.removeAsync({ _id: toStore(d._id) }, {});
      return d;
    },
    // Only the upsert + returnDocument "after" form is used.
    findOneAndUpdate: async (q: Doc, u: Doc, o: { upsert?: boolean; projection?: Doc }) => {
      if (!o.upsert) throw new Error("findOneAndUpdate without upsert is not supported");
      const { _id } = await upsert(ds, toStore(q), toStore(u));
      return findOne({ _id }, o);
    },
    // Only updateOne+upsert ops are used; NeDB has no batch write, so they run one by one.
    bulkWrite: async (ops: { updateOne: { filter: Doc; update: Doc; upsert?: boolean } }[]) => {
      let upsertedCount = 0;
      for (const { updateOne: op } of ops) {
        if (!op.upsert) throw new Error("bulkWrite supports only updateOne with upsert");
        if ((await upsert(ds, toStore(op.filter), toStore(op.update))).inserted) upsertedCount++;
      }
      return { upsertedCount };
    },
    createIndex: (keys: Doc, o: { unique?: boolean } = {}) => {
      const f = Object.keys(keys);
      return ds.ensureIndexAsync({ fieldName: f.length === 1 ? f[0] : f, unique: o.unique });
    },
  };
}

// One datafile per collection: DATA_DIR/<name>.db. A load error (e.g. too many corrupt lines) rejects connect,
// so the app never starts on empty data.
async function nedb(dir: string): Promise<Store> {
  const all: Record<string, ReturnType<typeof collection>> = {};
  for (const name of ["projects", "services", "endpoints", "requests"]) {
    const ds = new Datastore({ filename: join(dir, `${name}.db`) });
    await ds.loadDatabaseAsync();
    all[name] = collection(ds);
  }
  return {
    collection: <T extends Document>(name: string) => {
      if (!all[name]) throw new Error(`Unknown collection ${name}`);
      return all[name] as unknown as Collection<T>;
    },
  };
}

// Cached on globalThis so dev hot reload reuses one connection.
// A failed connect is dropped so the next request retries.
function db(): Promise<Store> {
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
