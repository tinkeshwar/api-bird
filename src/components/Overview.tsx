import Link from "next/link";
import { methodColor } from "@/components/MethodBadge";
import { hueOf, ProjectIcon } from "@/components/ProjectIcon";
import { ago, statusHue } from "@/lib/labels";
import { METHODS } from "@/lib/methods";

type Icon = (p: { size?: number }) => React.ReactNode;

// Overview toolbar: airmail kicker, title, actions on the right.
export function OverviewHeader({ actions }: { actions?: React.ReactNode }) {
  const now = new Date();
  const today = now.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  const h = now.getHours();
  const greeting = h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  return (
    <header className="rise flex flex-wrap items-end gap-4">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 font-mono text-[11px] tracking-[0.2em] text-subtle uppercase" suppressHydrationWarning>
          <span className="airmail inline-block h-2 w-6 rounded-sm" aria-hidden />
          {greeting} · {today}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg">Overview</h1>
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </header>
  );
}

// Postage stamp: perforated edge, tinted face, big denomination.
export function Stamp({ label, value, note, hue, Icon, delay = 0 }: { label: string; value: number; note?: string; hue: string; Icon: Icon; delay?: number }) {
  return (
    <div className="stamp-wrap rise" style={{ animationDelay: `${delay}ms` }}>
      <div className="stamp" style={{ "--hue": `var(--c-${hue})` } as React.CSSProperties}>
        <div className="stamp-face">
          <div className="flex items-center justify-between text-[10px] font-bold tracking-[0.16em] uppercase" style={{ color: "var(--hue)" }}>
            <dt>{label}</dt>
            <Icon size={14} />
          </div>
          <dd className="font-mono text-3xl leading-none font-semibold tracking-tight text-fg tabular-nums">{value}</dd>
          <p className="truncate font-mono text-[11px] text-muted">{note}</p>
        </div>
      </div>
    </div>
  );
}

// Inspector-style pane: thin title bar, then content.
export function Panel({ title, count, actions, children, className = "" }: { title: string; count?: number; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`panel rise ${className}`}>
      <div className="panel-bar">
        <h2>{title}</h2>
        {count !== undefined && <span className="rounded bg-surface px-1.5 font-mono text-[10px] text-muted tabular-nums">{count}</span>}
        {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export type ProjectRow = { id: string; name: string; icon?: string; services: number; endpoints: number; createdAt: string; edit?: React.ReactNode };

const cols = "grid grid-cols-[minmax(0,1fr)_4.5rem_7.5rem_2rem] items-center gap-3 sm:grid-cols-[minmax(0,1fr)_4.5rem_7.5rem_6.5rem_2rem]";

// Finder-style list view; the name link stretches over the row, edit sits above it.
export function ProjectTable({ rows, empty }: { rows: ProjectRow[]; empty?: React.ReactNode }) {
  if (!rows.length) return <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">{empty}</div>;
  const max = Math.max(1, ...rows.map((r) => r.endpoints));
  return (
    <div className="text-sm">
      <div className={`${cols} border-b border-line px-3 py-1.5 text-[10px] font-bold tracking-[0.12em] text-subtle uppercase`}>
        <span>Name</span>
        <span className="text-right">Services</span>
        <span>Endpoints</span>
        <span className="hidden sm:block">Created</span>
        <span />
      </div>
      <ul>
        {rows.map((r) => (
          <li key={r.id} className={`${cols} project-row group relative px-3 py-2`} style={{ "--hue": hueOf(r.name) } as React.CSSProperties}>
            <div className="flex min-w-0 items-center gap-2.5">
              <ProjectIcon icon={r.icon} name={r.name} size={26} />
              <Link href={`/projects/${r.id}`} className="truncate font-medium text-fg after:absolute after:inset-0">
                {r.name}
              </Link>
            </div>
            <span className={`text-right font-mono tabular-nums ${r.services ? "text-fg" : "text-subtle"}`}>{r.services}</span>
            <span className="flex items-center gap-2">
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-surface-2">
                <span className="block h-full rounded-full" style={{ width: `${(r.endpoints / max) * 100}%`, background: "var(--hue)" }} />
              </span>
              <span className={`w-7 text-right font-mono tabular-nums ${r.endpoints ? "text-fg" : "text-subtle"}`}>{r.endpoints}</span>
            </span>
            <time dateTime={r.createdAt} title={new Date(r.createdAt).toLocaleString()} className="hidden text-xs text-muted sm:block" suppressHydrationWarning>
              {ago(r.createdAt)}
            </time>
            <span className="relative z-10 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">{r.edit}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Endpoint count per method across every service, as one bar plus a legend.
export function MethodMix({ counts }: { counts: Record<string, number> }) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const mix = METHODS.filter((m) => counts[m]);
  if (!total) return <p className="px-3 py-6 text-center text-xs text-subtle">No endpoints yet</p>;
  return (
    <div className="space-y-3 p-3">
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        {mix.map((m) => (
          <span key={m} title={`${counts[m]} ${m}`} style={{ flexGrow: counts[m], background: methodColor(m) }} />
        ))}
      </div>
      <ul className="space-y-1 font-mono text-xs">
        {mix.map((m) => (
          <li key={m} className="flex items-center gap-2">
            <span className="size-2 rounded-sm" style={{ background: methodColor(m) }} />
            <span className="w-16 font-semibold" style={{ color: methodColor(m) }}>
              {m}
            </span>
            <span className="text-fg tabular-nums">{counts[m]}</span>
            <span className="ml-auto text-subtle tabular-nums">{Math.round((counts[m] / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type Run = { id: string; href: string; method: string; name: string; where: string; status: number; lastRunAt: string };

// Latest saved requests, newest first, each stamped with its status like a postmark.
export function RecentRuns({ runs }: { runs: Run[] }) {
  if (!runs.length) return <p className="px-3 py-6 text-center text-xs text-subtle">Nothing sent yet. Open an endpoint and hit Send.</p>;
  return (
    <ul className="divide-y divide-line">
      {runs.map((r) => (
        <li key={r.id}>
          <Link href={r.href} className="flex items-center gap-2.5 px-3 py-2 transition-colors hover:bg-surface-2">
            <span className="postmark" style={{ "--b": `var(--c-${statusHue(r.status)})` } as React.CSSProperties}>
              {r.status}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-sm">
                <span className="font-mono text-[10px] font-bold" style={{ color: methodColor(r.method) }}>
                  {r.method}
                </span>
                <span className="truncate text-fg">{r.name}</span>
              </span>
              <span className="block truncate text-[11px] text-muted">{r.where}</span>
            </span>
            <time dateTime={r.lastRunAt} title={new Date(r.lastRunAt).toLocaleString()} className="shrink-0 text-[11px] text-subtle" suppressHydrationWarning>
              {ago(r.lastRunAt)}
            </time>
          </Link>
        </li>
      ))}
    </ul>
  );
}
