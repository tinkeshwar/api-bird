import { MongoClient, ObjectId, type Db } from "mongodb";

// Schemas omit _id: the driver adds it on reads (WithId<T>) and generates it on insert.

export type KV = { key: string; value: string };

export type Var = { value: string; secret?: boolean };

export type Project = { name: string; icon?: string; vars?: Record<string, Var>; createdAt: Date };

export type Service = {
  projectId: ObjectId;
  name: string;
  type: "rest";
  protocol: "http" | "https";
  host: string;
  port: number;
  basePath?: string; // "" or "/api/v1": no trailing slash, prepended to every endpoint path
  createdAt: Date;
};

export type Endpoint = {
  serviceId: ObjectId;
  method: string;
  path: string;
  name: string;
  headers: KV[];
  query: KV[];
  body?: string;
  source: "openapi" | "manual";
  createdAt: Date;
};

export const serviceUrl = (s: Pick<Service, "protocol" | "host" | "port" | "basePath">) => `${s.protocol}://${s.host}:${s.port}${s.basePath ?? ""}`;

// "" stays empty; otherwise must start with "/" and hold no whitespace, ? or #. Trailing slashes go. null = invalid.
export function normBasePath(raw: string) {
  const p = raw.trim().replace(/\/+$/, "");
  if (!p) return "";
  return p.startsWith("/") && !/[\s?#]/.test(p) ? p : null;
}

const g = globalThis as unknown as { _db?: Promise<Db> };

function connect(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  return new MongoClient(uri).connect().then(async (client) => {
    const db = client.db(); // database name from the URI
    await db.collection("services").createIndex({ projectId: 1 });
    await db.collection("endpoints").createIndex({ serviceId: 1, method: 1, path: 1 }, { unique: true });
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

// Invalid hex ids become null so callers can notFound() instead of throwing.
export const oid = (id: string) => (ObjectId.isValid(id) ? new ObjectId(id) : null);
