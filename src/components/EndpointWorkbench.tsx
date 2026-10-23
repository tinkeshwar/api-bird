"use client";

import { useState, useTransition } from "react";
import {
  addCapture,
  deleteRequest,
  lockRequest,
  removeCapture,
  renameRequest,
  runEndpoint,
  updateEndpoint,
  type Result,
  type RunInput,
  type RunResult,
} from "@/app/actions";
import { KVRows } from "@/components/KVRows";
import { LockIcon, PlayIcon, RestoreIcon, TrashIcon, UnlockIcon } from "@/components/Icons";
import { methodColor } from "@/components/MethodBadge";
import type { Auth, Capture, KV } from "@/lib/db";
import { METHODS } from "@/lib/methods";
import { suggestLabel } from "@/lib/labels";
import { refs, varNameFor } from "@/lib/vars";

type Draft = {
  method: string;
  path: string;
  name: string;
  description: string;
  headers: KV[];
  query: KV[];
  body: string;
  noAuth: boolean;
  skipHeaders: string[];
};

// {param} but not {{var}}: the {{…}} alternative swallows var refs so they never count as params.
const PARAM = /\{\{[^}]*\}\}|\{([^{}]+)\}/g;
const pathParamNames = (path: string) => [
  ...new Set([...path.matchAll(PARAM)].map((m) => m[1]).filter(Boolean)),
];
// A saved request as plain data (see SavedRequest); lastRunAt is ISO.
export type HistoryEntry = {
  id: string;
  label?: string;
  locked?: boolean;
  input: RunInput;
  status: number;
  statusText: string;
  lastRunAt: string;
};

const fillParams = (o: RunInput) => o.path.replace(PARAM, (m, n?: string) => (n && o.params[n]) || m);
const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
function ago(iso: string) {
  const s = (Date.parse(iso) - Date.now()) / 1000;
  for (const [unit, n] of [["year", 31536000], ["month", 2592000], ["day", 86400], ["hour", 3600], ["minute", 60]] as const)
    if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), unit);
  return "just now";
}
const filled = (rows: KV[]) => rows.filter((r) => r.key.trim()).length;

function pretty(body: string) {
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

// JSON → [path, value] rows, e.g. lines[0].sku. Null when the body isn't a JSON object/array.
function flatten(v: unknown, path = ""): [string, string][] {
  if (v && typeof v === "object") {
    const entries = Object.entries(v);
    if (!entries.length) return [[path, Array.isArray(v) ? "[]" : "{}"]];
    return entries.flatMap(([k, x]) =>
      flatten(x, Array.isArray(v) ? `${path}[${k}]` : path ? `${path}.${k}` : k),
    );
  }
  return [[path, typeof v === "string" ? v : JSON.stringify(v)]];
}
function plainRows(body: string) {
  try {
    const v = JSON.parse(body);
    return v && typeof v === "object" ? flatten(v) : null;
  } catch {
    return null;
  }
}

const statusHue = (s: number) =>
  s >= 500
    ? "red"
    : s >= 400
      ? "amber"
      : s >= 300
        ? "blue"
        : s >= 200
          ? "green"
          : "gray";
// One-line summary of the inherited auth; the Basic password stays masked.
const authSummary = (a?: Auth) =>
  !a || a.type === "none"
    ? null
    : a.type === "bearer"
      ? `Bearer ${a.token}`
      : a.type === "basic"
        ? `Basic ${a.username} : ••••`
        : `API key (${a.in}) ${a.name}: ${a.value}`;
const authRefs = (a?: Auth) =>
  !a || a.type === "none" ? "" : a.type === "bearer" ? a.token : a.type === "basic" ? `${a.username}${a.password}` : `${a.name}${a.value}`;
const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

export function Tabs<T extends string>({
  tabs,
  active,
  onPick,
}: {
  tabs: [T, number?, boolean?][];
  active: T;
  onPick: (t: T) => void;
}) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-line px-3">
      {tabs.map(([t, n, off]) => (
        <button
          key={t}
          role="tab"
          type="button"
          aria-selected={t === active}
          disabled={off}
          onClick={() => onPick(t)}
          className={`-mb-px border-b-2 px-2.5 py-2 text-sm transition-colors disabled:opacity-40 ${t === active ? "border-accent font-medium text-fg" : "border-transparent text-muted hover:text-fg"}`}
        >
          {t}
          {!!n && (
            <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 text-xs text-accent-text tabular-nums">
              {n}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

const panel =
  "overflow-hidden rounded-xl border border-line bg-surface shadow-[var(--shadow)]";

// Request builder + response viewer. Run/save default to the real server actions; /dev passes mocks.
export function EndpointWorkbench({
  id,
  baseUrl,
  initial,
  vars = [],
  auth,
  projectHeaders = [],
  serviceHref,
  captures = [],
  history = [],
  actions,
  run = runEndpoint,
  save = updateEndpoint,
  capture = addCapture,
  uncapture = removeCapture,
  rename = renameRequest,
  lock = lockRequest,
  remove = deleteRequest,
}: {
  id: string;
  baseUrl: string;
  initial: Draft;
  vars?: string[]; // names the project defines, to flag unknown {{refs}}
  auth?: Auth; // the service's auth, shown read-only on the Auth tab
  projectHeaders?: KV[]; // sent with every request unless listed in skipHeaders
  serviceHref?: string; // where the service (and its auth) is edited
  captures?: Capture[];
  history?: HistoryEntry[]; // this endpoint's saved requests, newest run first
  actions?: React.ReactNode;
  run?: (id: string, o: RunInput) => Promise<RunResult>;
  save?: (prev: Result, fd: FormData) => Promise<Result>;
  capture?: (id: string, c: Capture, value?: string) => Promise<Result>;
  uncapture?: (id: string, name: string) => Promise<Result>;
  rename?: (id: string, label: string) => Promise<Result>;
  lock?: (id: string, locked: boolean) => Promise<Result>;
  remove?: (id: string) => Promise<Result>;
}) {
  const [d, setD] = useState(initial);
  const [savedAs, setSavedAs] = useState(initial);
  const [params, setParams] = useState<Record<string, string>>({});
  const [result, setResult] = useState<RunResult>();
  const [saved, setSaved] = useState<Result>({});
  const [reqTab, setReqTab] = useState<"Params" | "Headers" | "Auth" | "Body" | "Captures">("Params");
  const [resTab, setResTab] = useState<"Body" | "Headers">("Body");
  const [view, setView] = useState<"JSON" | "PLAIN">("JSON");
  const [caps, setCaps] = useState(captures);
  const [hist, setHist] = useState(history);
  const [last, setLast] = useState<[string, string?]>(); // [history row id, response body] of the last send; row is highlighted
  const [formKey, setFormKey] = useState(0); // KVRows is uncontrolled: bump to remount with loaded rows
  const [capErr, setCapErr] = useState<string>();
  const [newCap, setNewCap] = useState<Capture>({ var: "", from: "body", path: "" });
  // Short-lived note on one response row: [row key, text, isError].
  const [flash, setFlash] = useState<[string, string, boolean?]>();
  const [running, startRun] = useTransition();
  const [saving, startSave] = useTransition();
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const hasBody = d.method !== "GET" && d.method !== "HEAD";
  const names = pathParamNames(d.path);
  const dirty = JSON.stringify(d) !== JSON.stringify(savedAs);
  const tab = !hasBody && reqTab === "Body" ? "Params" : reqTab;

  // input given = a history replay; state set by load() hasn't flushed yet, so it's passed directly.
  const send = (input: RunInput = { ...d, params, body: hasBody ? d.body : "" }) =>
    startRun(async () => {
      const r = await run(id, input);
      setResult(r);
      // The run was saved (or re-run) as a request: move it to the top of History.
      if ("requestId" in r && r.requestId) {
        const rid = r.requestId;
        setLast([rid, "body" in r ? r.body : undefined]);
        setHist((h) => [
          { ...h.find((x) => x.id === rid), id: rid, input, status: r.status, statusText: r.statusText, lastRunAt: new Date().toISOString() },
          ...h.filter((x) => x.id !== rid),
        ]);
      }
      setView("status" in r && r.status >= 200 && r.status < 300 ? "PLAIN" : "JSON");
    });

  const note = (key: string, text: string, bad?: boolean) => {
    setFlash([key, text, bad]);
    setTimeout(() => setFlash((f) => (f?.[0] === key ? undefined : f)), 1500);
  };
  const copy = (key: string, value: string) => navigator.clipboard.writeText(value).then(() => note(key, "Copied"));
  // Saves the value now and keeps the rule, so the next 2xx response refreshes it. value omitted = rule only.
  const addCap = async (c: Capture, value?: string, key?: string) => {
    const r = await capture(id, c, value);
    if (r.error) return key ? note(key, r.error, true) : setCapErr(r.error);
    setCapErr(undefined);
    setCaps((cs) => [...cs.filter((x) => x.var !== c.var), c]);
    if (key) note(key, `Saved as {{${c.var}}}`);
    return true;
  };
  const dropCap = async (name: string) => {
    const r = await uncapture(id, name);
    if (r.error) setCapErr(r.error);
    else setCaps((cs) => cs.filter((x) => x.var !== name));
  };
  const saveVarBtn = (from: Capture["from"], path: string, value: string, key: string) => (
    <button
      type="button"
      onClick={() => addCap({ var: varNameFor(path), from, path }, value, key)}
      title={`Save as {{${varNameFor(path)}}} and capture it on every 2xx response`}
      aria-label={`Save ${path} as variable`}
      className="rounded px-1 text-subtle opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-surface-2 hover:text-accent-text"
    >
      {"{{ }}"}
    </button>
  );
  const rows = result && "body" in result ? plainRows(result.body) : null;

  // Fills the request window from a saved request. The draft may now differ from the endpoint (Unsaved); Save still saves the endpoint.
  const load = ({ input: i }: HistoryEntry) => {
    set({ method: i.method, path: i.path, query: i.query, headers: i.headers, body: i.body, noAuth: !!i.noAuth, skipHeaders: i.skipHeaders ?? [] });
    setParams(i.params);
    setFormKey((k) => k + 1);
  };
  const relabel = async (h: HistoryEntry, label: string) => {
    if (label.trim() === (h.label ?? "")) return;
    const r = await rename(h.id, label);
    if (r.error) return note(`r:${h.id}`, r.error, true);
    setHist((xs) => xs.map((x) => (x.id === h.id ? { ...x, label: label.trim() || undefined } : x)));
  };
  const toggleLock = async (h: HistoryEntry) => {
    const r = await lock(h.id, !h.locked);
    if (r.error) return note(`r:${h.id}`, r.error, true);
    setHist((xs) => xs.map((x) => (x.id === h.id ? { ...x, locked: !h.locked || undefined } : x)));
  };
  const drop = async (h: HistoryEntry) => {
    const r = await remove(h.id);
    if (r.error) note(`r:${h.id}`, r.error, true);
    else setHist((xs) => xs.filter((x) => x.id !== h.id));
  };

  const persist = () =>
    startSave(async () => {
      const fd = new FormData();
      fd.set("id", id);
      for (const k of ["method", "path", "name", "description", "body"] as const)
        fd.set(k, d[k]);
      if (d.noAuth) fd.set("noAuth", "on");
      for (const h of d.skipHeaders) fd.append("skipHeaders", h);
      for (const n of ["headers", "query"] as const)
        for (const r of d[n]) {
          fd.append(`${n}.key`, r.key);
          fd.append(`${n}.value`, r.value);
        }
      const r = await save({}, fd);
      setSaved(r);
      if (!r.error) setSavedAs(d);
    });

  // Live preview of what Send will hit: params substituted, query appended, {{vars}} highlighted
  // (red when the project doesn't define them). Query shown unencoded so refs stay readable.
  const qs = d.query
    .filter((q) => q.key.trim())
    .map((q) => `${q.key.trim()}=${q.value}`)
    .join("&");
  const mark = (text: string) =>
    text.split(/(\{\{[^}]*\}\}|\{[^{}]+\})/).map((p, i) =>
      p.startsWith("{{") ? (
        <span
          key={i}
          className={vars.includes(p.slice(2, -2)) ? "text-[var(--c-green)]" : "text-[var(--c-red)]"}
          title={vars.includes(p.slice(2, -2)) ? "Project variable" : "Not defined in Project variables"}
        >
          {p}
        </span>
      ) : p.startsWith("{") ? (
        <span
          key={i}
          className={params[p.slice(1, -1)] ? "text-fg" : "text-accent-text"}
        >
          {params[p.slice(1, -1)] || p}
        </span>
      ) : (
        p
      ),
    );
  const undefinedVars = refs(
    [d.path, qs, ...d.headers.flatMap((h) => [h.key, h.value]), hasBody ? d.body : "", d.noAuth ? "" : authRefs(auth)].join("\n"),
  ).filter((n) => !vars.includes(n));

  return (
    <div
      className="space-y-4"
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send();
        if ((e.metaKey || e.ctrlKey) && e.key === "s") {
          e.preventDefault();
          persist();
        }
      }}
    >
      {/* Hero card, same family as ServiceHeader but hued by the method. Name is editable in place, saved with the rest. */}
      <div
        className="card project-card gap-4 p-5"
        style={{ "--hue": methodColor(d.method) } as React.CSSProperties}
      >
        <div className="flex flex-wrap items-start gap-4">
          <span
            className="flex size-[52px] shrink-0 items-center justify-center rounded-xl font-mono text-[11px] font-bold text-white"
            style={{
              background: `linear-gradient(135deg, var(--hue), color-mix(in srgb, var(--hue) 55%, #000))`,
              boxShadow: "0 6px 18px -6px var(--hue)",
            }}
          >
            {d.method}
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <input
              value={d.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="Untitled endpoint"
              aria-label="Endpoint name"
              className="-ml-1.5 w-full rounded-lg border border-transparent bg-transparent px-1.5 font-display text-2xl font-semibold transition-colors hover:border-line focus:border-accent focus:outline-none"
            />
            <input
              value={d.description}
              onChange={(e) => set({ description: e.target.value })}
              placeholder="Add a description"
              aria-label="Endpoint description"
              className="-ml-1.5 w-full rounded-lg border border-transparent bg-transparent px-1.5 text-sm text-muted transition-colors hover:border-line focus:border-accent focus:text-fg focus:outline-none"
            />
            <p
              className="truncate font-mono text-xs text-muted"
              title={`${baseUrl}${d.path}${qs ? `?${qs}` : ""}`}
            >
              <span className="text-subtle">{baseUrl}</span>
              <span className="text-fg">{mark(d.path)}</span>
              {qs && <span className="text-accent-text">?{mark(qs)}</span>}
            </p>
            {undefinedVars.length > 0 && (
              <p className="text-xs text-[var(--c-red)]">
                Not defined in Project variables:{" "}
                <span className="font-mono">{undefinedVars.map((n) => `{{${n}}}`).join(", ")}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {saved.error && (
              <span className="text-xs text-[var(--c-red)]">{saved.error}</span>
            )}
            {!saved.error && (
              <span
                className={`flex items-center gap-1.5 text-xs ${dirty ? "text-[var(--c-amber)]" : "text-subtle"}`}
              >
                <span className="size-1.5 rounded-full bg-current" />
                {dirty ? "Unsaved" : "Saved"}
              </span>
            )}
            <button
              onClick={persist}
              disabled={saving || !dirty}
              className="btn"
              title="Save (⌘S)"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {actions}
          </div>
        </div>
        <p className="flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-xs text-muted tabular-nums">
          {(
            [
              ["path params", names.length],
              ["query", filled(d.query)],
              ["headers", filled(d.headers)],
              ["body", hasBody && d.body.trim() ? 1 : 0],
            ] as const
          ).map(([label, n]) => (
            <span key={label} className="flex items-center gap-1.5">
              <span
                className="size-2 rounded-full"
                style={{
                  background: n ? "var(--hue)" : "var(--border-strong)",
                }}
              />
              {label === "body" ? (n ? "body" : "no body") : `${n} ${label}`}
            </span>
          ))}
        </p>
      </div>

      {/* Request bar: method · base · path · Send, one joined control. */}
      <div className={`${panel} flex items-stretch focus-within:border-accent`}>
        <select
          value={d.method}
          onChange={(e) => set({ method: e.target.value })}
          aria-label="Method"
          className="input rounded-none border-0 border-r border-line bg-surface-2 font-mono font-semibold"
          style={{ color: methodColor(d.method) }}
        >
          {METHODS.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <span className="hidden items-center pl-3 font-mono text-sm text-subtle md:flex">
          {baseUrl}
        </span>
        <input
          value={d.path}
          onChange={(e) => set({ path: e.target.value })}
          aria-label="Path"
          className="min-w-0 flex-1 bg-transparent px-2 py-2.5 font-mono text-sm focus:outline-none"
        />
        <button
          onClick={() => send()}
          disabled={running}
          className="btn-primary m-1.5 px-5"
          title="Send (⌘↵)"
        >
          {running ? "Sending…" : "Send"}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <section className={panel} aria-label="Request">
          <Tabs
            tabs={[
              ["Params", names.length + filled(d.query)],
              ["Headers", filled(d.headers)],
              ["Auth"],
              ["Body", d.body.trim() ? 1 : 0, !hasBody],
              ["Captures", caps.length],
            ]}
            active={tab}
            onPick={setReqTab}
          />
          <div className="space-y-4 p-4">
            {tab === "Params" && (
              <>
                {names.length > 0 && (
                  <div className="label">
                    Path params
                    <div className="space-y-1">
                      {names.map((n) => (
                        <div key={n} className="flex items-center gap-2">
                          <span className="w-1/3 truncate rounded-lg bg-accent-soft px-2.5 py-1.5 font-mono text-sm text-accent-text">{`{${n}}`}</span>
                          <input
                            value={params[n] ?? ""}
                            onChange={(e) =>
                              setParams((p) => ({ ...p, [n]: e.target.value }))
                            }
                            placeholder="value"
                            aria-label={n}
                            className="input flex-1 font-mono"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="label">
                  Query params
                  <KVRows
                    key={formKey}
                    name="query"
                    initial={d.query}
                    onChange={(query) => set({ query })}
                  />
                </div>
              </>
            )}
            {tab === "Headers" && (
              <div className="space-y-3">
                <KVRows
                  key={formKey}
                  name="headers"
                  initial={d.headers}
                  onChange={(headers) => set({ headers })}
                />
                {projectHeaders.length > 0 && (
                  <div className="space-y-1 text-sm">
                    <p className="text-muted">From project (a header above with the same name wins). Untick to skip for this endpoint:</p>
                    {projectHeaders.map((h) => {
                      const skipped = d.skipHeaders.includes(h.key);
                      return (
                        <label key={h.key} className="flex items-center gap-2 font-mono">
                          <input
                            type="checkbox"
                            checked={!skipped}
                            onChange={() => set({ skipHeaders: skipped ? d.skipHeaders.filter((k) => k !== h.key) : [...d.skipHeaders, h.key] })}
                          />
                          <span className={skipped ? "text-subtle line-through" : ""}>
                            {h.key}: {mark(h.value)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {tab === "Auth" && (
              <div className="space-y-3 text-sm">
                {authSummary(auth) ? (
                  <p className={d.noAuth ? "text-subtle line-through" : ""}>
                    Inherited from service: <span className="font-mono">{mark(authSummary(auth)!)}</span>
                  </p>
                ) : (
                  <p className="text-muted">The service has no auth.</p>
                )}
                {serviceHref && (
                  <a href={serviceHref} className="text-accent-text hover:underline">
                    Edit service auth →
                  </a>
                )}
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={d.noAuth} onChange={(e) => set({ noAuth: e.target.checked })} />
                  No auth <span className="text-muted">(public route, e.g. /login or /health)</span>
                </label>
              </div>
            )}
            {tab === "Captures" && (
              <div className="space-y-3 text-sm">
                <p className="text-muted">After a 2xx response, these values are saved to project variables.</p>
                {caps.length > 0 && (
                  <ul className="divide-y divide-line rounded-lg border border-line font-mono text-xs">
                    {caps.map((c) => (
                      <li key={c.var} className="flex items-center gap-2 px-3 py-1.5">
                        <span className="text-accent-text">{`{{${c.var}}}`}</span>
                        <span className="text-subtle">←</span>
                        <span className="min-w-0 flex-1 truncate" title={c.path}>
                          {c.from === "header" && <span className="text-muted">header </span>}
                          {c.path}
                        </span>
                        <button
                          type="button"
                          onClick={() => dropCap(c.var)}
                          className="btn-icon hover:text-[var(--c-red)]"
                          aria-label={`Remove capture of ${c.var}`}
                          title="Remove capture (the variable stays)"
                        >
                          <TrashIcon />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <form
                  className="flex flex-wrap items-center gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await addCap(newCap)) setNewCap({ var: "", from: newCap.from, path: "" });
                  }}
                >
                  <input
                    value={newCap.var}
                    onChange={(e) => setNewCap({ ...newCap, var: e.target.value })}
                    placeholder="variable"
                    aria-label="Variable name"
                    required
                    className="input w-32 font-mono"
                  />
                  <select
                    value={newCap.from}
                    onChange={(e) => setNewCap({ ...newCap, from: e.target.value as Capture["from"] })}
                    aria-label="Capture from"
                    className="input"
                  >
                    <option value="body">body</option>
                    <option value="header">header</option>
                  </select>
                  <input
                    value={newCap.path}
                    onChange={(e) => setNewCap({ ...newCap, path: e.target.value })}
                    placeholder={newCap.from === "header" ? "x-auth-token" : "data.accessToken"}
                    aria-label={newCap.from === "header" ? "Header name" : "Body path"}
                    required
                    className="input min-w-32 flex-1 font-mono"
                  />
                  <button className="btn">Add</button>
                </form>
                {capErr && <p className="text-xs text-[var(--c-red)]">{capErr}</p>}
              </div>
            )}
            {tab === "Body" && (
              <textarea
                value={d.body}
                onChange={(e) => set({ body: e.target.value })}
                placeholder={'{\n  "key": "value"\n}'}
                rows={12}
                spellCheck={false}
                className="input w-full font-mono"
              />
            )}
          </div>
        </section>

        <section className={`${panel} flex flex-col`} aria-label="Response" aria-busy={running}>
          {!result || running ? (
            <div className="flex min-h-64 flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
              {running ? (
                <>
                  <span className="size-8 animate-spin rounded-full border-2 border-line border-t-accent" />
                  <p className="text-sm text-muted">Waiting for response…</p>
                </>
              ) : (
                <>
                  <p className="font-medium">No response yet</p>
                  <p className="text-sm text-muted">
                    Hit <span className="font-medium text-fg">Send</span> or
                    press{" "}
                    <kbd className="rounded border border-line-strong bg-surface-2 px-1.5 font-mono text-xs">
                      ⌘ ↵
                    </kbd>
                  </p>
                </>
              )}
            </div>
          ) : "error" in result ? (
            <div className="space-y-2 p-4">
              <p className="flex items-center gap-2 text-sm">
                <span className="badge rounded px-2 font-semibold [--b:var(--c-red)]">
                  Request failed
                </span>
                <span className="text-muted tabular-nums">
                  {result.durationMs} ms
                </span>
              </p>
              <p className="rounded-lg bg-surface-2 p-3 font-mono text-sm text-[var(--c-red)]">
                {result.error}
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 pr-4">
                <Tabs
                  tabs={[
                    ["Body"],
                    ["Headers", Object.keys(result.headers).length],
                  ]}
                  active={resTab}
                  onPick={setResTab}
                />
                <p className="flex items-center gap-3 text-xs text-muted tabular-nums">
                  <span
                    className="badge rounded px-2 py-0.5 font-mono font-semibold"
                    style={
                      {
                        "--b": `var(--c-${statusHue(result.status)})`,
                      } as React.CSSProperties
                    }
                  >
                    {result.status} {result.statusText}
                  </span>
                  {result.refreshed && (
                    <span
                      className="badge rounded px-2 py-0.5 [--b:var(--c-blue)]"
                      title={result.refreshed.map((r) => `{{${r.var}}} via ${r.via}`).join("\n")}
                    >
                      ↻ token refreshed via {[...new Set(result.refreshed.map((r) => r.via))].join(", ")}
                    </span>
                  )}
                  {result.captured && (
                    <span className="text-[var(--c-green)]" title="Captured into project variables">
                      → {result.captured.map((n) => `{{${n}}}`).join(", ")}
                    </span>
                  )}
                  <span>{result.durationMs} ms</span>
                  <span>
                    {kb(new TextEncoder().encode(result.body).length)}
                  </span>
                </p>
              </div>
              {result.truncated && (
                <p className="px-4 pt-3 text-xs text-[var(--c-amber)]">
                  Body truncated at 1 MB
                </p>
              )}
              {resTab === "Body" ? (
                <>
                  {rows && view === "PLAIN" ? (
                    <dl className="max-h-[32rem] flex-1 divide-y divide-line overflow-auto font-mono text-xs">
                      {rows.map(([k, v]) => (
                        <div
                          key={k}
                          className="group grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-3 px-4 py-1.5"
                        >
                          <dt className="truncate text-muted" title={k}>
                            {flash?.[0] === k ? (
                              <span className={flash[2] ? "text-[var(--c-red)]" : "text-[var(--c-green)]"}>{flash[1]}</span>
                            ) : (
                              k || "(root)"
                            )}
                          </dt>
                          <dd>
                            <button
                              type="button"
                              onClick={() => copy(k, v)}
                              title="Copy value"
                              className="w-full rounded text-left break-all hover:bg-surface-2"
                            >
                              {v}
                            </button>
                          </dd>
                          {k ? saveVarBtn("body", k, v, k) : <span />}
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <pre className="max-h-[32rem] flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed">
                      {pretty(result.body) || (
                        <span className="text-subtle">(empty body)</span>
                      )}
                    </pre>
                  )}
                  {rows && (
                    <div className="mt-auto flex justify-end border-t border-line px-3 py-2">
                      <div role="group" aria-label="Body view" className="flex rounded-lg border border-line p-0.5 text-xs font-medium">
                        {(["JSON", "PLAIN"] as const).map((v) => (
                          <button
                            key={v}
                            type="button"
                            aria-pressed={view === v}
                            onClick={() => setView(v)}
                            className={`rounded-md px-2.5 py-1 ${view === v ? "bg-surface-2 text-fg" : "text-muted hover:text-fg"}`}
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <dl className="max-h-[32rem] divide-y divide-line overflow-auto font-mono text-xs">
                  {Object.entries(result.headers).map(([k, v]) => (
                    <div
                      key={k}
                      className="group grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-3 px-4 py-1.5"
                    >
                      <dt className="truncate text-muted">
                        {flash?.[0] === `h:${k}` ? <span className={flash[2] ? "text-[var(--c-red)]" : "text-[var(--c-green)]"}>{flash[1]}</span> : k}
                      </dt>
                      <dd className="break-all">{v}</dd>
                      {saveVarBtn("header", k, v, `h:${k}`)}
                    </div>
                  ))}
                </dl>
              )}
            </>
          )}
        </section>
      </div>

      <section className={panel} aria-label="History">
        <h2 className="border-b border-line px-4 py-2.5 text-sm font-medium">
          History
          {hist.length > 0 && (
            <span className="ml-1.5 rounded-full bg-accent-soft px-1.5 text-xs text-accent-text tabular-nums">{hist.length}</span>
          )}
        </h2>
        {hist.length ? (
          <ul className="divide-y divide-line">
            {hist.map((h) => {
              const q = h.input.query.filter((x) => x.key.trim()).map((x) => `${x.key.trim()}=${x.value}`).join("&");
              const err = flash?.[0] === `r:${h.id}` && flash[1];
              const isLast = h.id === last?.[0];
              const hint = !h.label && !h.locked && suggestLabel(h.input, h.status, { name: d.name, description: d.description, responseBody: isLast ? last[1] : undefined });
              return (
                <li key={h.id} aria-current={isLast || undefined} className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 text-sm ${isLast ? "bg-accent-soft" : ""}`}>
                  <span className="w-14 shrink-0 font-mono text-xs font-bold" style={{ color: methodColor(h.input.method) }}>
                    {h.input.method}
                  </span>
                  <span className="min-w-0 flex-1 basis-48 truncate font-mono text-xs" title={`${fillParams(h.input)}${q ? `?${q}` : ""}`}>
                    {fillParams(h.input)}
                    {q && <span className="text-accent-text">?{q}</span>}
                  </span>
                  <span
                    className="badge rounded px-2 py-0.5 font-mono text-xs font-semibold"
                    style={{ "--b": `var(--c-${statusHue(h.status)})` } as React.CSSProperties}
                    title={h.statusText}
                  >
                    {h.status}
                  </span>
                  <time dateTime={h.lastRunAt} title={new Date(h.lastRunAt).toLocaleString()} className="w-24 text-xs text-muted tabular-nums" suppressHydrationWarning>
                    {ago(h.lastRunAt)}
                  </time>
                  {h.locked ? (
                    <span className="w-40 flex-1 truncate px-2.5 text-xs text-muted sm:flex-none" title={h.label}>
                      {h.label}
                    </span>
                  ) : (
                    <input
                      key={h.label ?? ""} // remount when a suggestion sets the label
                      defaultValue={h.label ?? ""}
                      onBlur={(e) => relabel(h, e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
                      placeholder="Add label"
                      aria-label="Label"
                      className="input w-40 flex-1 py-1 text-xs sm:flex-none"
                    />
                  )}
                  {hint && (
                    <button
                      type="button"
                      onClick={() => relabel(h, hint)}
                      className="max-w-full truncate rounded-full border border-dashed border-line-strong px-2 py-0.5 text-xs text-muted hover:border-accent hover:text-accent-text"
                      title="Use suggested label"
                    >
                      + {hint}
                    </button>
                  )}
                  <button type="button" onClick={() => load(h)} className="btn-icon" aria-label="Load into the request window" title="Load into the request window">
                    <RestoreIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      load(h);
                      send(h.input);
                    }}
                    disabled={running}
                    className="btn-icon hover:text-accent-text"
                    aria-label="Re-run"
                    title="Load and send"
                  >
                    <PlayIcon />
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleLock(h)}
                    aria-pressed={!!h.locked}
                    className={`btn-icon ${h.locked ? "text-accent-text" : ""}`}
                    aria-label={h.locked ? "Unlock" : "Lock"}
                    title={h.locked ? "Unlock (allow rename and delete)" : "Lock (prevent rename and delete)"}
                  >
                    {h.locked ? <LockIcon /> : <UnlockIcon />}
                  </button>
                  {!h.locked && (
                    <button
                      type="button"
                      onClick={() => drop(h)}
                      className="btn-icon hover:text-[var(--c-red)]"
                      aria-label="Delete saved request"
                      title="Delete saved request"
                    >
                      <TrashIcon />
                    </button>
                  )}
                  {err && <p className="w-full text-xs text-[var(--c-red)]">{err}</p>}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="p-6 text-center text-sm text-muted">Requests you send appear here</p>
        )}
      </section>
    </div>
  );
}
