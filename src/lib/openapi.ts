import { parse } from "yaml";

// Kept free of Next/Mongo imports so `node --test` can load it directly.

import { METHODS } from "./methods.ts";

export { METHODS };

export type ParsedEndpoint = {
  method: string;
  path: string;
  name: string;
  description?: string;
  headers: { key: string; value: string }[];
  query: { key: string; value: string }[];
  body?: string;
  noAuth?: boolean;
};

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

export function parseOpenApi(text: string): ParsedEndpoint[] {
  let doc: unknown;
  try {
    doc = parse(text); // YAML is a superset of JSON
  } catch {
    throw new Error("Not an OpenAPI document");
  }
  if (!isObj(doc) || !(doc.openapi || doc.swagger) || !isObj(doc.paths)) throw new Error("Not an OpenAPI document");

  // Local refs only (#/a/b); external refs are ignored. `seen` guards against ref cycles.
  const deref = (v: unknown, seen = new Set<string>()): unknown => {
    if (!isObj(v) || typeof v.$ref !== "string") return v;
    const ref = v.$ref;
    if (!ref.startsWith("#/") || seen.has(ref)) return undefined;
    seen.add(ref);
    let cur: unknown = doc;
    for (const part of ref.slice(2).split("/")) {
      cur = isObj(cur) ? cur[part.replace(/~1/g, "/").replace(/~0/g, "~")] : undefined;
    }
    return deref(cur, seen);
  };

  const out: ParsedEndpoint[] = [];
  for (const [path, rawItem] of Object.entries(doc.paths)) {
    const item = deref(rawItem);
    if (!isObj(item)) continue;
    const pathParams = Array.isArray(item.parameters) ? item.parameters : [];

    for (const method of METHODS) {
      const op = item[method.toLowerCase()];
      if (!isObj(op)) continue;

      // Merge path-level then operation-level params; operation wins on same name+in.
      const params = new Map<string, Obj>();
      for (const raw of [...pathParams, ...(Array.isArray(op.parameters) ? op.parameters : [])]) {
        const p = deref(raw);
        if (isObj(p) && typeof p.name === "string") params.set(`${p.in}:${p.name}`, p);
      }
      const rows = (where: string) =>
        [...params.values()]
          .filter((p) => p.in === where)
          .map((p) => ({ key: p.name as string, value: p.example === undefined ? "" : String(p.example) }));

      const headers = rows("header");
      let body: string | undefined;
      const rb = deref(op.requestBody);
      const json = isObj(rb) && isObj(rb.content) ? rb.content["application/json"] : undefined;
      if (isObj(json) && json.example !== undefined) {
        body = JSON.stringify(json.example, null, 2);
        headers.push({ key: "Content-Type", value: "application/json" });
      }

      const name =
        (typeof op.summary === "string" && op.summary.trim()) ||
        (typeof op.operationId === "string" && op.operationId) ||
        `${method} ${path}`;

      const description = typeof op.description === "string" ? op.description.trim() : "";

      // `security: []` on an operation marks it public.
      const noAuth = Array.isArray(op.security) && !op.security.length;
      out.push({ method, path, name, ...(description && { description }), headers, query: rows("query"), ...(body !== undefined && { body }), ...(noAuth && { noAuth }) });
    }
  }
  return out;
}
