"use client";

import { useState, useTransition } from "react";
import {
  runEndpoint,
  updateEndpoint,
  type Result,
  type RunInput,
  type RunResult,
} from "@/app/actions";
import { KVRows } from "@/components/KVRows";
import { methodColor } from "@/components/MethodBadge";
import type { KV } from "@/lib/db";
import { METHODS } from "@/lib/methods";
import { refs } from "@/lib/vars";

type Draft = {
  method: string;
  path: string;
  name: string;
  headers: KV[];
  query: KV[];
  body: string;
};

// {param} but not {{var}}: the {{…}} alternative swallows var refs so they never count as params.
const PARAM = /\{\{[^}]*\}\}|\{([^{}]+)\}/g;
const pathParamNames = (path: string) => [
  ...new Set([...path.matchAll(PARAM)].map((m) => m[1]).filter(Boolean)),
];
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
const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

function Tabs<T extends string>({
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
  actions,
  run = runEndpoint,
  save = updateEndpoint,
}: {
  id: string;
  baseUrl: string;
  initial: Draft;
  vars?: string[]; // names the project defines, to flag unknown {{refs}}
  actions?: React.ReactNode;
  run?: (id: string, o: RunInput) => Promise<RunResult>;
  save?: (prev: Result, fd: FormData) => Promise<Result>;
}) {
  const [d, setD] = useState(initial);
  const [savedAs, setSavedAs] = useState(initial);
  const [params, setParams] = useState<Record<string, string>>({});
  const [result, setResult] = useState<RunResult>();
  const [saved, setSaved] = useState<Result>({});
  const [reqTab, setReqTab] = useState<"Params" | "Headers" | "Body">("Params");
  const [resTab, setResTab] = useState<"Body" | "Headers">("Body");
  const [view, setView] = useState<"JSON" | "PLAIN">("JSON");
  const [copied, setCopied] = useState<string>();
  const [running, startRun] = useTransition();
  const [saving, startSave] = useTransition();
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const hasBody = d.method !== "GET" && d.method !== "HEAD";
  const names = pathParamNames(d.path);
  const dirty = JSON.stringify(d) !== JSON.stringify(savedAs);
  const tab = !hasBody && reqTab === "Body" ? "Params" : reqTab;

  const send = () =>
    startRun(async () => {
      const r = await run(id, { ...d, params, body: hasBody ? d.body : "" });
      setResult(r);
      setView("status" in r && r.status >= 200 && r.status < 300 ? "PLAIN" : "JSON");
    });

  const copy = (key: string, value: string) =>
    navigator.clipboard.writeText(value).then(() => {
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? undefined : c)), 1200);
    });
  const rows = result && "body" in result ? plainRows(result.body) : null;

  const persist = () =>
    startSave(async () => {
      const fd = new FormData();
      fd.set("id", id);
      for (const k of ["method", "path", "name", "body"] as const)
        fd.set(k, d[k]);
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
    [d.path, qs, ...d.headers.flatMap((h) => [h.key, h.value]), hasBody ? d.body : ""].join("\n"),
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
          onClick={send}
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
              ["Body", d.body.trim() ? 1 : 0, !hasBody],
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
                    name="query"
                    initial={d.query}
                    onChange={(query) => set({ query })}
                  />
                </div>
              </>
            )}
            {tab === "Headers" && (
              <KVRows
                name="headers"
                initial={d.headers}
                onChange={(headers) => set({ headers })}
              />
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
                          className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 px-4 py-1.5"
                        >
                          <dt className="truncate text-muted" title={k}>
                            {copied === k ? (
                              <span className="text-[var(--c-green)]">Copied</span>
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
                      className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 px-4 py-1.5"
                    >
                      <dt className="truncate text-muted">{k}</dt>
                      <dd className="break-all">{v}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
