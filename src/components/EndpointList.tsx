import Link from "next/link";
import { ChevronRightIcon } from "@/components/Icons";
import { MethodBadge, methodColor } from "@/components/MethodBadge";
import { METHODS } from "@/lib/methods";

type Row = { id: string; href: string; method: string; path: string; name?: string; produces?: string[] };

// "/invoices/{id}/send" → "invoices"; endpoints group under their first path segment.
const resourceOf = (path: string) => path.split("/").find(Boolean) ?? "/";

// {params} get the accent so the shape of a path reads at a glance.
function Path({ path }: { path: string }) {
  return (
    <span className="truncate font-mono text-sm">
      {path.split(/(\{[^}]+\})/).map((p, i) => (p.startsWith("{") ? <span key={i} className="text-accent-text">{p}</span> : p))}
    </span>
  );
}

// Server-rendered: ?method= and ?q= drive filtering (native GET form, no client JS), so state survives reloads and links.
export function EndpointList({ rows, method, q = "", empty }: { rows: Row[]; method?: string; q?: string; empty?: React.ReactNode }) {
  if (rows.length === 0) return empty;
  const counts = Object.groupBy(rows, (r) => r.method);
  const active = method && counts[method] ? method : undefined;
  const needle = q.trim().toLowerCase();
  const shown = rows.filter((r) => (!active || r.method === active) && (!needle || `${r.path} ${r.name ?? ""}`.toLowerCase().includes(needle)));
  const groups = Object.entries(Object.groupBy(shown, (r) => resourceOf(r.path)));
  const href = (m?: string) => `?${new URLSearchParams({ ...(m && { method: m }), ...(needle && { q }) })}`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <nav className="flex flex-wrap gap-1.5">
          {[undefined, ...METHODS.filter((m) => counts[m])].map((m) => (
            <Link
              key={m ?? "all"}
              href={href(m)}
              scroll={false}
              aria-current={m === active ? "page" : undefined}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${m === active ? "border-accent bg-accent-soft text-accent-text" : "border-line bg-surface text-muted hover:border-line-strong hover:text-fg"}`}
            >
              {m && <span className="size-2 rounded-full" style={{ background: methodColor(m) }} />}
              {m ?? "All"}
              <span className="text-subtle tabular-nums">{m ? counts[m]!.length : rows.length}</span>
            </Link>
          ))}
        </nav>
        <form className="ml-auto w-full sm:w-64">
          {active && <input type="hidden" name="method" value={active} />}
          <input type="search" name="q" defaultValue={q} placeholder="Filter by path or name…" aria-label="Filter endpoints" className="input w-full" />
        </form>
      </div>

      {groups.length === 0 ? (
        <p className="rounded-xl border border-dashed border-line-strong p-6 text-center text-sm text-muted">No endpoints match.</p>
      ) : (
        groups.map(([resource, list]) => (
          <section key={resource} className="overflow-hidden rounded-xl border border-line bg-surface" style={{ boxShadow: "var(--shadow)" }}>
            <h2 className="flex items-center justify-between border-b border-line bg-surface-2/60 px-4 py-2 font-mono text-xs font-semibold text-muted">
              /{resource === "/" ? "" : resource}
              <span className="font-sans font-normal text-subtle tabular-nums">{list!.length}</span>
            </h2>
            <ul className="divide-y divide-line">
              {list!.map((e) => (
                <li key={e.id}>
                  <Link href={e.href} className="group flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-2">
                    <MethodBadge method={e.method} />
                    <Path path={e.path} />
                    {e.produces?.map((v) => (
                      <span key={v} className="hidden shrink-0 rounded-full bg-accent-soft px-2 py-0.5 font-mono text-xs text-accent-text sm:inline" title="Captured from this endpoint's response">
                        produces {`{{${v}}}`}
                      </span>
                    ))}
                    <span className="ml-auto hidden truncate text-sm text-muted sm:block">{e.name}</span>
                    <span className="text-subtle opacity-0 transition-opacity group-hover:opacity-100">
                      <ChevronRightIcon />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
