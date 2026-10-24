"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type Filter, type ObjectId, type WithId } from "mongodb";
import { checkEndpoint, endpoints, hasBody, normBasePath, oid, producers, projects, requestHash, requests, serviceUrl, services, type Auth, type Capture, type Endpoint, type EndpointInput, type KV, type RunInput, type Service, type Var } from "@/lib/db";
import { METHODS, parseOpenApi } from "@/lib/openapi";
import { applyAuth, captureValues, fill, refs, VAR_NAME } from "@/lib/vars";

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
  await deleteRequests({ serviceId: { $in: ids } });
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

// Sent with every request in the project; an endpoint's own header (or the service auth) of the same name wins.
export async function setProjectHeaders(_: Result, fd: FormData): Promise<Result> {
  const projectId = oid(str(fd, "projectId"));
  if (!projectId) return fail("Project not found");
  const r = await (await projects()).updateOne({ _id: projectId }, { $set: { headers: kv(fd, "headers") } });
  if (!r.matchedCount) return fail("Project not found");
  return done("Saved");
}

// Captured values: only .value is overwritten on existing vars; new ones start secret.
async function saveCaptured(projectId: ObjectId, vars: Record<string, Var>, got: Record<string, string>) {
  const set = Object.fromEntries(
    Object.entries(got).map(([n, value]) => (Object.hasOwn(vars, n) ? [`vars.${n}.value`, value] : [`vars.${n}`, { value, secret: true }])),
  );
  if (Object.keys(set).length) await (await projects()).updateOne({ _id: projectId }, { $set: set });
}

// ---------- captures ----------

// Adds (or replaces, by var name) a capture rule. With a value, also saves it to the var now.
export async function addCapture(endpointId: string, c: Capture, value?: string): Promise<Result> {
  const id = oid(endpointId);
  const ep = id && (await (await endpoints()).findOne({ _id: id }));
  const svc = ep && (await (await services()).findOne({ _id: ep.serviceId }));
  if (!svc) return fail("Endpoint not found");
  const rule: Capture = { var: String(c.var).trim(), from: c.from, path: String(c.path).trim() };
  if (!VAR_NAME.test(rule.var)) return fail("Name must start with a letter or _ and use only letters, digits, _ or -");
  if (rule.from !== "body" && rule.from !== "header") return fail("Capture from body or header");
  if (!rule.path) return fail(rule.from === "header" ? "Header name is required" : "Path is required");
  await (await endpoints()).updateOne({ _id: ep._id }, { $set: { captures: [...(ep.captures ?? []).filter((x) => x.var !== rule.var), rule] } });
  if (value !== undefined) {
    const vars = (await (await projects()).findOne({ _id: svc.projectId }, { projection: { vars: 1 } }))?.vars ?? {};
    await saveCaptured(svc.projectId, vars, { [rule.var]: String(value) });
  }
  return done();
}

// Drops the rule only; the variable stays.
export async function removeCapture(endpointId: string, name: string): Promise<Result> {
  const id = oid(endpointId);
  if (!id) return fail("Endpoint not found");
  const r = await (await endpoints()).updateOne({ _id: id }, { $pull: { captures: { var: name } } });
  if (!r.matchedCount) return fail("Endpoint not found");
  return done();
}

// ---------- services ----------

// Reads <AuthFields>: auth.type plus that type's fields. Values are kept raw (no trim) since they may be secrets.
function readAuth(fd: FormData): Auth | { error: string } {
  const raw = (k: string) => String(fd.get(`auth.${k}`) ?? "");
  switch (str(fd, "auth.type") || "none") {
    case "none":
      return { type: "none" };
    case "bearer":
      return raw("token").trim() ? { type: "bearer", token: raw("token").trim() } : fail("Bearer token is required");
    case "basic":
      return raw("username").trim() ? { type: "basic", username: raw("username").trim(), password: raw("password") } : fail("Username is required");
    case "apikey": {
      const at = str(fd, "auth.in");
      const name = str(fd, "auth.name");
      if (at !== "header" && at !== "query") return fail("API key must go in a header or query param");
      if (!name || /\s/.test(name)) return fail("API key name is required and has no spaces");
      return { type: "apikey", in: at, name, value: raw("value") };
    }
    default:
      return fail("Unknown auth type");
  }
}

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
  const auth = readAuth(fd);
  if ("error" in auth) return auth;
  return { name, type, protocol, host, port, basePath, auth } as const;
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
  await deleteRequests({ serviceId: svc._id });
  await (await endpoints()).deleteMany({ serviceId: svc._id });
  await (await services()).deleteOne({ _id: svc._id });
  revalidatePath("/", "layout");
  redirect(`/projects/${svc.projectId}`);
}

// ---------- endpoints ----------

// Saved requests of the endpoints matching `filter`.
async function deleteRequests(filter: Filter<Endpoint>) {
  const ids = (await (await endpoints()).find(filter, { projection: { _id: 1 } }).toArray()).map((e) => e._id);
  await (await requests()).deleteMany({ endpointId: { $in: ids } });
}

const readEndpoint = (fd: FormData): EndpointInput => ({
  method: str(fd, "method"),
  path: str(fd, "path"),
  name: str(fd, "name"),
  description: str(fd, "description"),
  body: String(fd.get("body") ?? ""),
  headers: kv(fd, "headers"),
  query: kv(fd, "query"),
  noAuth: !!fd.get("noAuth"),
  skipHeaders: fd.getAll("skipHeaders").map(String),
});

const isDup = (e: unknown) => (e as { code?: unknown })?.code === 11000;
const DUP = "An endpoint with this method and path already exists in this service";

export async function createEndpoint(_: Result, fd: FormData): Promise<Result> {
  return addEndpoint(str(fd, "serviceId"), readEndpoint(fd));
}

export async function updateEndpoint(_: Result, fd: FormData): Promise<Result> {
  return editEndpoint(str(fd, "id"), readEndpoint(fd));
}

export async function importOpenApi(_: Result, fd: FormData): Promise<Result> {
  const f = fd.get("file");
  if (!(f instanceof File) || f.size === 0) return fail("Choose a .yml, .yaml or .json file");
  return importSpec(str(fd, "serviceId"), await f.text());
}

// Plain-object versions of the actions above, shared with the MCP tools.

export async function addEndpoint(serviceIdStr: string, input: EndpointInput): Promise<Result> {
  const serviceId = oid(serviceIdStr);
  if (!serviceId || !(await (await services()).countDocuments({ _id: serviceId }))) return fail("Service not found");
  const e = checkEndpoint(input);
  if ("error" in e) return fail(e.error);
  try {
    await (await endpoints()).insertOne({ serviceId, ...e, source: "manual", createdAt: new Date() });
  } catch (err) {
    if (isDup(err)) return fail(DUP);
    throw err;
  }
  return done();
}

export async function editEndpoint(idStr: string, input: EndpointInput): Promise<Result> {
  const id = oid(idStr);
  if (!id) return fail("Endpoint not found");
  const e = checkEndpoint(input);
  if ("error" in e) return fail(e.error);
  // Empty body/description are removed, not stored as null.
  const { body, description, ...rest } = e;
  const $unset = { ...(body === undefined && { body: "" as const }), ...(description === undefined && { description: "" as const }) };
  try {
    const r = await (await endpoints()).updateOne(
      { _id: id },
      { $set: { ...rest, ...(body !== undefined && { body }), ...(description !== undefined && { description }) }, ...(Object.keys($unset).length && { $unset }) },
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
  await (await requests()).deleteMany({ endpointId: ep._id });
  const svc = await (await services()).findOne({ _id: ep.serviceId });
  revalidatePath("/", "layout");
  redirect(svc ? `/projects/${svc.projectId}/services/${svc._id}` : "/");
}

export async function importSpec(serviceIdStr: string, text: string): Promise<Result> {
  const serviceId = oid(serviceIdStr);
  if (!serviceId || !(await (await services()).countDocuments({ _id: serviceId }))) return fail("Service not found");
  let parsed;
  try {
    parsed = parseOpenApi(text);
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

// ---------- saved requests ----------

// Empty label (after trim) removes it.
export async function renameRequest(id: string, label: string): Promise<Result> {
  const _id = oid(id);
  if (!_id) return fail("Request not found");
  const l = String(label).trim();
  const r = await (await requests()).updateOne({ _id, locked: { $ne: true } }, l ? { $set: { label: l } } : { $unset: { label: "" } });
  if (!r.matchedCount) return fail("Request not found or locked");
  return done();
}

export async function deleteRequest(id: string): Promise<Result> {
  const _id = oid(id);
  if (!_id) return fail("Request not found");
  const r = await (await requests()).deleteOne({ _id, locked: { $ne: true } });
  if (!r.deletedCount) return fail("Request not found or locked");
  return done();
}

export async function lockRequest(id: string, locked: boolean): Promise<Result> {
  const _id = oid(id);
  if (!_id) return fail("Request not found");
  const r = await (await requests()).updateOne({ _id }, locked ? { $set: { locked: true } } : { $unset: { locked: "" } });
  if (!r.matchedCount) return fail("Request not found");
  return done();
}

// ---------- run ----------

export type { RunInput };

export type RunResult =
  | {
      status: number;
      statusText: string;
      headers: Record<string, string>;
      body: string;
      truncated?: boolean;
      captured?: string[]; // vars updated from this response
      refreshed?: { var: string; via: string }[]; // vars a producer endpoint refreshed before this response
      durationMs: number;
      requestId?: string; // the SavedRequest this run was stored as
    }
  | { error: string; durationMs: number };

const MAX_BODY = 1024 * 1024;

// Project headers minus the ones this request skips (by name, any case).
const sentHeaders = (ph: KV[], o: RunInput) => ph.filter((h) => !o.skipHeaders?.some((s) => s.toLowerCase() === h.key.trim().toLowerCase()));

// {{refs}} the request will send, service auth included unless noAuth.
const usedRefs = (o: RunInput, auth?: Auth) =>
  refs(
    [o.path, ...[...o.headers, ...o.query].flatMap((r) => [r.key, r.value]), hasBody(o.method) ? o.body : "", o.noAuth || !auth ? "" : Object.values(auth).join("\n")].join("\n"),
  );

// Auto-refresh: an empty or missing var with a producer (an endpoint in the project that captures it) runs that
// producer first, and a 401 on a request using producer-backed vars runs them once more and retries once.
// Producers never trigger producers (depth 1), so there are no loops.
export async function runEndpoint(endpointId: string, o: RunInput): Promise<RunResult> {
  const start = performance.now();
  const ms = () => Math.round(performance.now() - start);
  const id = oid(endpointId);
  const ep = id && (await (await endpoints()).findOne({ _id: id }));
  const svc = ep && (await (await services()).findOne({ _id: ep.serviceId }));
  if (!svc) return { error: "Endpoint not found", durationMs: ms() };
  if (!METHODS.includes(o.method.toUpperCase())) return { error: "Invalid method", durationMs: ms() };
  if (!o.path.startsWith("/")) return { error: "Path must start with /", durationMs: ms() };

  const project = await (await projects()).findOne({ _id: svc.projectId }, { projection: { vars: 1, headers: 1 } });
  const vars = project?.vars ?? {};
  const ph = project?.headers ?? [];
  const withPh = (i: RunInput) => ({ ...i, headers: [...i.headers, ...sentHeaders(ph, i)] });
  const prods = await producers(svc.projectId);
  // An endpoint is never its own producer.
  const producerOf = (n: string) => prods.get(n)?.find((p) => !p.ep._id.equals(ep._id));
  const empty = (n: string) => !vars[n]?.value;
  const refreshed: { var: string; via: string }[] = [];

  // Runs each distinct producer of these vars once. Returns an error message, or undefined on success.
  const refresh = async (names: string[]) => {
    for (const p of new Set(names.map((n) => producerOf(n)!))) {
      const mine = names.filter((n) => producerOf(n) === p);
      const failed = (why: string) => `Refreshing ${mine.map((n) => `{{${n}}}`).join(", ")} via ${p.via} failed: ${why}`;
      const input = { ...p.ep, params: {}, body: p.ep.body ?? "" };
      const blocked = usedRefs(withPh(input), p.svc.auth).find((n) => empty(n) && prods.get(n)?.some((x) => x !== p));
      if (blocked) return failed(`it needs {{${blocked}}}, which has no value (producers don't run other producers)`);
      const r = await exec(p.ep, p.svc, input, vars, ph);
      if ("error" in r) return failed(r.error);
      if (r.status < 200 || r.status > 299) return failed(`${r.status} ${r.statusText}`);
      const lost = mine.find((n) => !r.captured?.includes(n));
      if (lost) return failed(`the response has no value for {{${lost}}}`);
      refreshed.push(...mine.map((n) => ({ var: n, via: p.via })));
    }
  };
  const withRefreshed = async (r: RunResult): Promise<RunResult> =>
    "error" in r ? { ...r, durationMs: ms() } : { ...r, ...(refreshed.length && { refreshed }), ...(await save(ep._id, o, r)) };

  const used = usedRefs(withPh(o), svc.auth);
  const err = await refresh(used.filter((n) => empty(n) && producerOf(n)));
  if (err) return { error: err, durationMs: ms() };
  const r = await exec(ep, svc, o, vars, ph);
  if ("error" in r || r.status !== 401) return withRefreshed(r);
  const again = used.filter((n) => producerOf(n) && !refreshed.some((x) => x.var === n));
  if (!again.length) return withRefreshed(r);
  const err2 = await refresh(again);
  if (err2) return { error: err2, durationMs: ms() };
  return withRefreshed(await exec(ep, svc, o, vars, ph));
}

// Upserts the run as its endpoint's SavedRequest. A failed save never fails the run.
async function save(endpointId: ObjectId, input: RunInput, r: { status: number; statusText: string }) {
  try {
    const now = new Date();
    const doc = await (await requests()).findOneAndUpdate(
      { endpointId, hash: requestHash(input) },
      { $set: { input, status: r.status, statusText: r.statusText, lastRunAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true, returnDocument: "after", projection: { _id: 1 } },
    );
    return doc ? { requestId: String(doc._id) } : {};
  } catch (e) {
    console.error("Saving request failed", e);
    return {};
  }
}

// Fills and sends one request (project headers `ph` added under the endpoint's), saving captures from a 2xx response into the DB and into `vars` (mutated).
async function exec(ep: WithId<Endpoint>, svc: WithId<Service>, o: RunInput, vars: Record<string, Var>, ph: KV[]): Promise<RunResult> {
  const start = performance.now();
  const ms = () => Math.round(performance.now() - start);
  try {
    const method = o.method.toUpperCase();

    // {param} path params first ({{var}} refs are skipped), then {{var}} everywhere. Any unresolved ref blocks the send.
    const missing: string[] = [];
    const v = (s: string) => {
      const r = fill(s, vars);
      missing.push(...r.missing);
      return r.text;
    };
    const path = v(o.path.replace(/\{\{[^}]*\}\}|\{([^{}]+)\}/g, (m, n?: string) => (n ? encodeURIComponent(o.params[n] ?? "") : m)));
    const kvs = (rows: KV[]) => rows.filter((r) => r.key.trim()).map((r) => [v(r.key.trim()), v(r.value)] as [string, string]);
    // Auth fields are filled before applyAuth so Basic encodes the substituted values.
    const a = o.noAuth ? undefined : svc.auth;
    const auth = a && (Object.fromEntries(Object.entries(a).map(([k, x]) => [k, k === "type" || k === "in" ? x : v(x)])) as Auth);
    const { headers: own, query } = applyAuth(auth, kvs(o.headers), kvs(o.query));
    const headers = [...own, ...kvs(sentHeaders(ph, o)).filter(([k]) => !own.some(([h]) => h.toLowerCase() === k.toLowerCase()))];
    const qs = new URLSearchParams(query).toString();
    const sendBody = hasBody(method) && o.body ? v(o.body) : undefined;
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
    const resHeaders = Object.fromEntries(res.headers);

    // A capture whose path is missing is skipped; it never fails the run.
    const got = res.ok && ep.captures?.length ? captureValues(ep.captures, body, resHeaders) : {};
    const captured = Object.keys(got);
    if (captured.length) {
      await saveCaptured(svc.projectId, vars, got);
      for (const [n, value] of Object.entries(got)) vars[n] = { ...vars[n], value };
      revalidatePath("/", "layout");
    }

    return {
      status: res.status,
      statusText: res.statusText,
      headers: resHeaders,
      body,
      ...(truncated && { truncated }),
      ...(captured.length && { captured }),
      durationMs: ms(),
    };
  } catch (e) {
    // undici reports "fetch failed" with the useful part (e.g. ECONNREFUSED) on cause.
    const err = e as Error & { cause?: { code?: string; message?: string } };
    const detail = [...new Set([err.cause?.code, err.cause?.message].filter(Boolean))].join(": ");
    return { error: detail ? `${err.message} (${detail})` : err.message || String(e), durationMs: ms() };
  }
}
