import type { RunInput } from "./db.ts";

const PHRASE: Record<number, string> = {
  400: "Bad request",
  401: "Unauthenticated",
  403: "Forbidden",
  404: "Not found",
  405: "Method not allowed",
  409: "Conflict",
  410: "Gone",
  413: "Payload too large",
  415: "Unsupported media type",
  422: "Validation error",
  429: "Rate limited",
};
const INTENT: Record<string, string> = { GET: "Fetch", POST: "Create", PUT: "Replace", PATCH: "Update", DELETE: "Delete", HEAD: "Probe", OPTIONS: "Options" };
const MAX = 60;

// First sentence of the description, if it is short enough to be a label.
const sentence = (s?: string) => {
  const t = s?.trim().split(/(?<=[.!?])\s|\n/)[0].replace(/[.!?]$/, "");
  return t && t.length <= 40 ? t : undefined;
};

// A short error/message string from a JSON response body, e.g. {"error":"Invoice is locked"}.
function message(body?: string) {
  try {
    const v = JSON.parse(body ?? "");
    const m = [v?.message, v?.error, v?.detail, v?.title, v?.error?.message].find((x) => typeof x === "string" && x.trim());
    return m && m.length <= 40 ? m.trim() : undefined;
  } catch {
    return undefined;
  }
}

// ponytail: rule-based label from status + what makes this request different. Swap for an LLM if labels need prose.
export function suggestLabel(
  input: RunInput,
  status: number,
  ctx: { name?: string; description?: string; responseBody?: string } = {},
) {
  const autoName = !ctx.name || ctx.name === `${input.method} ${input.path}`;
  const subject = (autoName ? sentence(ctx.description) : ctx.name) ?? `${INTENT[input.method] ?? input.method} ${input.path.split("/").filter((p) => p && !p.includes("{")).at(-1) ?? ""}`.trim();
  const outcome =
    status >= 200 && status < 300
      ? subject
      : message(ctx.responseBody) ?? PHRASE[status] ?? (status >= 500 ? "Server error" : status >= 300 && status < 400 ? "Redirect" : `HTTP ${status}`);

  const inPath = new Set([...input.path.matchAll(/\{\{[^}]*\}\}|\{([^{}]+)\}/g)].flatMap((m) => (m[1] ? [m[1]] : [])));
  const details = [
    ...Object.entries(input.params).filter(([k, v]) => inPath.has(k) && v).map(([k, v]) => `${k}=${v}`),
    ...input.query.filter((q) => q.key.trim()).map((q) => `${q.key.trim()}=${q.value}`),
    input.method !== "GET" && input.method !== "HEAD" && !input.body.trim() && "empty body",
    input.noAuth && "no auth",
    ...(input.skipHeaders ?? []).map((h) => `no ${h}`),
  ].filter(Boolean);

  const label = details.length ? `${outcome}: ${details.join(", ")}` : outcome;
  return label.length > MAX ? `${label.slice(0, MAX - 1)}…` : label;
}
