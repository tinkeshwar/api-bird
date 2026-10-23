"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { MongoServerError } from "mongodb";
import { endpoints, normBasePath, oid, projects, serviceUrl, services, type KV } from "@/lib/db";
import { METHODS, parseOpenApi } from "@/lib/openapi";
import { fill, VAR_NAME } from "@/lib/vars";

// ponytail: no auth, this is a single-user local tool. Add auth before exposing it on a network,
// runEndpoint in particular lets any caller make requests from the server.

export type Result = { ok?: boolean; error?: string; message?: string };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const fail = (error: string) => ({ error });
const done = (message?: string): Result => {
  revalidatePath("/", "layout");
  return { ok: true, message };
};

// Reads rows rendered by <KVRows name=...>: parallel `${name}.key` / `${name}.value` fields.
function kv(fd: FormData, name: string): KV[] {
  const keys = fd.getAll(`${name}.key`).map(String);
  const values = fd.getAll(`${name}.value`).map(String);
  return keys.map((key, i) => ({ key: key.trim(), value: values[i] ?? "" })).filter((r) => r.key);
}

// ---------- projects ----------

async function readIcon(fd: FormData): Promise<string | undefined | Result> {
  const f = fd.get("icon");
  if (!(f instanceof File) || f.size === 0) return undefined;
  if (!f.type.startsWith("image/")) return fail("Icon must be an image");
  if (f.size > 100 * 1024) return fail("Icon must be 100KB or smaller");
  return `data:${f.type};base64,${Buffer.from(await f.arrayBuffer()).toString("base64")}`;
}

export async function createProject(_: Result, fd: FormData): Promise<Result> {
  const name = str(fd, "name");
  if (!name) return fail("Name is required");
  const icon = await readIcon(fd);
  if (typeof icon === "object") return icon;
  await (await projects()).insertOne({ name, ...(icon && { icon }), createdAt: new Date() });
  return done();
}

export async function updateProject(_: Result, fd: FormData): Promise<Result> {
  const id = oid(str(fd, "id"));
  const name = str(fd, "name");
  if (!id) return fail("Project not found");
  if (!name) return fail("Name is required");
  const icon = await readIcon(fd);
  if (typeof icon === "object") return icon;
  const r = await (await projects()).updateOne({ _id: id }, { $set: { name, ...(icon && { icon }) } });
  if (!r.matchedCount) return fail("Project not found");
  return done("Saved");
}

export async function deleteProject(_: Result, fd: FormData): Promise<Result> {
  const id = oid(str(fd, "id"));
  if (!id) return fail("Project not found");
  const svc = await services();
  const ids = (await svc.find({ projectId: id }, { projection: { _id: 1 } }).toArray()).map((s) => s._id);
  // ponytail: no transaction, a crash mid-way can leave orphans. Use a session if that matters.
  await (await endpoints()).deleteMany({ serviceId: { $in: ids } });
  await svc.deleteMany({ projectId: id });
  await (await projects()).deleteOne({ _id: id });
  revalidatePath("/", "layout");
  redirect("/");
}

// ---------- project variables ----------

function readVar(fd: FormData) {
  const projectId = oid(str(fd, "projectId"));
  const name = str(fd, "name");
  if (!projectId) return fail("Project not found");
  if (!VAR_NAME.test(name)) return fail("Name must start with a letter or _ and use only letters, digits, _ or -");
  return { projectId, name };
}

export async function setVar(_: Result, fd: FormData): Promise<Result> {
  const v = readVar(fd);
  if ("error" in v) return v;
  const value = String(fd.get("value") ?? "");
  const r = await (await projects()).updateOne(
    { _id: v.projectId },
    { $set: { [`vars.${v.name}`]: { value, ...(fd.get("secret") && { secret: true }) } } },
  );
  if (!r.matchedCount) return fail("Project not found");
  return done();
}

export async function deleteVar(_: Result, fd: FormData): Promise<Result> {
  const v = readVar(fd);
  if ("error" in v) return v;
  const r = await (await projects()).updateOne({ _id: v.projectId }, { $unset: { [`vars.${v.name}`]: "" } });
  if (!r.matchedCount) return fail("Project not found");
  return done();
}

// ---------- services ----------

function readService(fd: FormData) {
  const name = str(fd, "name");
  const type = str(fd, "type");
  const protocol = str(fd, "protocol");
  const host = str(fd, "host");
  const port = Number(str(fd, "port"));
  const basePath = normBasePath(str(fd, "basePath"));
  if (!name) return fail("Name is required");
  if (type !== "rest") return fail("Type must be REST API");
  if (protocol !== "http" && protocol !== "https") return fail("Protocol must be http or https");
  if (!host || /:\/\/|\/|\s/.test(host)) return fail("Host must be a bare hostname, e.g. localhost");
  if (!Number.isInteger(port) || port < 1 || port > 65535) return fail("Port must be 1–65535");
  if (basePath === null) return fail("Base path must start with / and have no spaces, ? or #");
  return { name, type, protocol, host, port, basePath } as const;
}

export async function createService(_: Result, fd: FormData): Promise<Result> {
  const projectId = oid(str(fd, "projectId"));
  if (!projectId || !(await (await projects()).countDocuments({ _id: projectId }))) return fail("Project not found");
  const s = readService(fd);
  if ("error" in s) return s;
  await (await services()).insertOne({ projectId, ...s, createdAt: new Date() });
  return done();
}

export async function updateService(_: Result, fd: FormData): Promise<Result> {
  const id = oid(str(fd, "id"));
  if (!id) return fail("Service not found");
  const s = readService(fd);
  if ("error" in s) return s;
  const r = await (await services()).updateOne({ _id: id }, { $set: s });
  if (!r.matchedCount) return fail("Service not found");
  return done("Saved");
}

export async function deleteService(_: Result, fd: FormData): Promise<Result> {
  const id = oid(str(fd, "id"));
  const svc = id && (await (await services()).findOne({ _id: id }));
  if (!svc) return fail("Service not found");
  await (await endpoints()).deleteMany({ serviceId: svc._id });
  await (await services()).deleteOne({ _id: svc._id });
  revalidatePath("/", "layout");
  redirect(`/projects/${svc.projectId}`);
}

// ---------- endpoints ----------

function readEndpoint(fd: FormData) {
  const method = str(fd, "method").toUpperCase();
  const path = str(fd, "path");
  const name = str(fd, "name");
  const body = String(fd.get("body") ?? "");
  if (!METHODS.includes(method)) return fail(`Method must be one of ${METHODS.join(", ")}`);
  if (!path.startsWith("/")) return fail("Path must start with /");
  if (!name) return fail("Name is required");
  return { method, path, name, headers: kv(fd, "headers"), query: kv(fd, "query"), body: body || undefined };
}

const isDup = (e: unknown) => e instanceof MongoServerError && e.code === 11000;
const DUP = "An endpoint with this method and path already exists in this service";

export async function createEndpoint(_: Result, fd: FormData): Promise<Result> {
  const serviceId = oid(str(fd, "serviceId"));
  if (!serviceId || !(await (await services()).countDocuments({ _id: serviceId }))) return fail("Service not found");
  const e = readEndpoint(fd);
  if ("error" in e) return e;
  try {
    await (await endpoints()).insertOne({ serviceId, ...e, source: "manual", createdAt: new Date() });
  } catch (err) {
    if (isDup(err)) return fail(DUP);
    throw err;
  }
  return done();
}

export async function updateEndpoint(_: Result, fd: FormData): Promise<Result> {
  const id = oid(str(fd, "id"));
  if (!id) return fail("Endpoint not found");
  const e = readEndpoint(fd);
  if ("error" in e) return e;
  const { body, ...rest } = e;
  try {
    const r = await (await endpoints()).updateOne(
      { _id: id },
      body === undefined ? { $set: rest, $unset: { body: "" } } : { $set: { ...rest, body } },
    );
    if (!r.matchedCount) return fail("Endpoint not found");
  } catch (err) {
    if (isDup(err)) return fail(DUP);
    throw err;
  }
  return done("Saved");
}

export async function deleteEndpoint(_: Result, fd: FormData): Promise<Result> {
  const id = oid(str(fd, "id"));
  const ep = id && (await (await endpoints()).findOneAndDelete({ _id: id }));
  if (!ep) return fail("Endpoint not found");
  const svc = await (await services()).findOne({ _id: ep.serviceId });
  revalidatePath("/", "layout");
  redirect(svc ? `/projects/${svc.projectId}/services/${svc._id}` : "/");
}

export async function importOpenApi(_: Result, fd: FormData): Promise<Result> {
  const serviceId = oid(str(fd, "serviceId"));
  if (!serviceId || !(await (await services()).countDocuments({ _id: serviceId }))) return fail("Service not found");
  const f = fd.get("file");
  if (!(f instanceof File) || f.size === 0) return fail("Choose a .yml, .yaml or .json file");
  let parsed;
  try {
    parsed = parseOpenApi(await f.text());
  } catch (e) {
    return fail(e instanceof Error ? e.message : "Could not parse file");
  }
  if (!parsed.length) return fail("No operations found in this document");
  const createdAt = new Date();
  const r = await (await endpoints()).bulkWrite(
    parsed.map((e) => ({
      updateOne: {
        filter: { serviceId, method: e.method, path: e.path },
        // $setOnInsert only, so re-importing never overwrites existing or edited endpoints.
        update: { $setOnInsert: { ...e, serviceId, source: "openapi" as const, createdAt } },
        upsert: true,
      },
    })),
  );
  return done(`${r.upsertedCount} added, ${parsed.length - r.upsertedCount} already existed`);
}

// ---------- run ----------

export type RunInput = {
  method: string;
  path: string;
  params: Record<string, string>;
  query: KV[];
  headers: KV[];
  body: string;
};

export type RunResult =
  | {
      status: number;
      statusText: string;
      headers: Record<string, string>;
      body: string;
      truncated?: boolean;
      durationMs: number;
    }
  | { error: string; durationMs: number };

const MAX_BODY = 1024 * 1024;

export async function runEndpoint(endpointId: string, o: RunInput): Promise<RunResult> {
  const start = performance.now();
  const ms = () => Math.round(performance.now() - start);
  try {
    const id = oid(endpointId);
    const ep = id && (await (await endpoints()).findOne({ _id: id }));
    const svc = ep && (await (await services()).findOne({ _id: ep.serviceId }));
    if (!svc) return { error: "Endpoint not found", durationMs: ms() };

    const method = o.method.toUpperCase();
    if (!METHODS.includes(method)) return { error: "Invalid method", durationMs: ms() };
    if (!o.path.startsWith("/")) return { error: "Path must start with /", durationMs: ms() };

    // {param} path params first ({{var}} refs are skipped), then {{var}} everywhere. Any unresolved ref blocks the send.
    const vars = (await (await projects()).findOne({ _id: svc.projectId }, { projection: { vars: 1 } }))?.vars ?? {};
    const missing: string[] = [];
    const v = (s: string) => {
      const r = fill(s, vars);
      missing.push(...r.missing);
      return r.text;
    };
    const path = v(o.path.replace(/\{\{[^}]*\}\}|\{([^{}]+)\}/g, (m, n?: string) => (n ? encodeURIComponent(o.params[n] ?? "") : m)));
    const kvs = (rows: KV[]) => rows.filter((r) => r.key.trim()).map((r) => [v(r.key.trim()), v(r.value)] as [string, string]);
    const qs = new URLSearchParams(kvs(o.query)).toString();
    const headers = kvs(o.headers);
    const sendBody = method !== "GET" && method !== "HEAD" && o.body ? v(o.body) : undefined;
    if (missing.length)
      return { error: `{{${missing[0]}}} has no value. Set it in Project variables or capture it from a login response.`, durationMs: ms() };
    const url = `${serviceUrl(svc)}${path}${qs ? `?${qs}` : ""}`;

    const res = await fetch(url, {
      method,
      headers,
      body: sendBody,
      signal: AbortSignal.timeout(30_000),
      redirect: "manual",
    });

    // Read at most MAX_BODY bytes, then cancel, so a huge response can't fill memory.
    const chunks: Uint8Array[] = [];
    let size = 0;
    let truncated = false;
    const reader = res.body?.getReader();
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.length;
      if (size > MAX_BODY) {
        truncated = true;
        await reader.cancel();
        break;
      }
    }
    const body = Buffer.concat(chunks).subarray(0, MAX_BODY).toString("utf8");

    return {
      status: res.status,
      statusText: res.statusText,
      headers: Object.fromEntries(res.headers),
      body,
      ...(truncated && { truncated }),
      durationMs: ms(),
    };
  } catch (e) {
    // undici reports "fetch failed" with the useful part (e.g. ECONNREFUSED) on cause.
    const err = e as Error & { cause?: { code?: string; message?: string } };
    const detail = [...new Set([err.cause?.code, err.cause?.message].filter(Boolean))].join(": ");
    return { error: detail ? `${err.message} (${detail})` : err.message || String(e), durationMs: ms() };
  }
}
