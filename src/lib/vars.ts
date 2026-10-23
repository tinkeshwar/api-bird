// Kept free of Next/Mongo imports so `node --test` can load it directly.

import type { Auth, Capture, Var } from "./db.ts";

// Safe as a Mongo key: no leading $, no dots.
export const VAR_NAME = /^[A-Za-z_][\w-]*$/;
const REF = /\{\{([A-Za-z_][\w-]*)\}\}/g;

// Names used as {{name}} in text, each once, in order of first use.
export const refs = (text: string) => [...new Set([...text.matchAll(REF)].map((m) => m[1]))];

// Substitutes defined vars (an empty value counts as defined); unknown refs stay as-is and are reported.
export function fill(text: string, vars: Record<string, Var>) {
  const missing = new Set<string>();
  const out = text.replace(REF, (m, n: string) => {
    if (Object.hasOwn(vars, n)) return vars[n].value;
    missing.add(n);
    return m;
  });
  return { text: out, missing: [...missing] };
}

// Adds the service's auth to already-filled rows. A header (or query param) the endpoint sets itself wins.
export function applyAuth(auth: Auth | undefined, headers: [string, string][], query: [string, string][]) {
  const has = (rows: [string, string][], name: string) => rows.some(([k]) => k.toLowerCase() === name.toLowerCase());
  const add = (rows: [string, string][], name: string, value: string) => (has(rows, name) ? rows : [...rows, [name, value] as [string, string]]);
  // btoa needs latin1, so encode UTF-8 bytes first.
  const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));
  switch (auth?.type) {
    case "bearer":
      return { headers: add(headers, "Authorization", `Bearer ${auth.token}`), query };
    case "basic":
      return { headers: add(headers, "Authorization", `Basic ${b64(`${auth.username}:${auth.password}`)}`), query };
    case "apikey":
      return auth.in === "query"
        ? { headers, query: add(query, auth.name, auth.value) }
        : { headers: add(headers, auth.name, auth.value), query };
    default:
      return { headers, query };
  }
}

// Value at a PLAIN-view path (data.token, lines[0].id, [0].id) in a JSON body; non-strings come back as JSON.
// Undefined when the body isn't JSON or the path is missing. ponytail: keys containing . or [ can't be addressed.
export function pick(body: string, path: string) {
  let v: unknown;
  try {
    v = JSON.parse(body);
  } catch {
    return undefined;
  }
  for (const k of path.match(/[^.[\]]+/g) ?? []) {
    if (!v || typeof v !== "object" || !Object.hasOwn(v, k)) return undefined;
    v = (v as Record<string, unknown>)[k];
  }
  return v === undefined ? undefined : typeof v === "string" ? v : JSON.stringify(v);
}

// Var name suggested from a path's last segment or a header name: access_token → accessToken, x-auth-token → xAuthToken.
export function varNameFor(path: string) {
  const last = path.match(/[^.[\]]+/g)?.findLast((s) => !/^\d+$/.test(s)) ?? "value";
  const name = last.replace(/[^A-Za-z0-9]+(.)?/g, (_, c?: string) => c?.toUpperCase() ?? "");
  return /^[A-Za-z_]/.test(name) ? name : `_${name}`;
}

// The values a response yields for these rules; missing paths and headers are skipped.
export function captureValues(captures: Capture[], body: string, headers: Record<string, string>) {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const out: Record<string, string> = {};
  for (const c of captures) {
    const v = c.from === "header" ? lower[c.path.toLowerCase()] : pick(body, c.path);
    if (v !== undefined) out[c.var] = v;
  }
  return out;
}
