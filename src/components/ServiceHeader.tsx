import { methodColor } from "@/components/MethodBadge";
import { hueOf, ProjectIcon } from "@/components/ProjectIcon";
import { METHODS } from "@/lib/methods";

// Service hero: identity, the base URL split into its parts, and a proportional method mix bar.
export function ServiceHeader({ name, url, counts, actions }: { name: string; url: string; counts: Record<string, number>; actions?: React.ReactNode }) {
  const u = new URL(url);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const mix = METHODS.filter((m) => counts[m]);

  return (
    <div className="card project-card gap-4 p-5" style={{ "--hue": hueOf(name) } as React.CSSProperties}>
      <div className="flex flex-wrap items-start gap-4">
        <ProjectIcon name={name} size={52} />
        <div className="min-w-0 flex-1 space-y-1.5">
          <h1 className="truncate text-2xl font-semibold">{name}</h1>
          <p className="flex min-w-0 items-center gap-2 font-mono text-sm">
            <span className="badge rounded px-1.5 text-xs font-semibold uppercase" style={{ "--b": u.protocol === "https:" ? "var(--c-green)" : "var(--c-amber)" } as React.CSSProperties}>
              {u.protocol.slice(0, -1)}
            </span>
            <span className="truncate select-all" title={url}>
              <span className="text-fg">{u.host}</span>
              <span className="text-accent-text">{u.pathname === "/" ? "" : u.pathname}</span>
            </span>
          </p>
        </div>
        {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
      </div>

      <div className="space-y-2">
        <div className="flex h-1.5 overflow-hidden rounded-full bg-surface-2">
          {mix.map((m) => (
            <span key={m} title={`${counts[m]} ${m}`} style={{ flexGrow: counts[m], background: methodColor(m) }} />
          ))}
        </div>
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span className="font-medium text-fg tabular-nums">
            {total} endpoint{total === 1 ? "" : "s"}
          </span>
          {mix.map((m) => (
            <span key={m} className="flex items-center gap-1.5 tabular-nums">
              <span className="size-2 rounded-full" style={{ background: methodColor(m) }} />
              {m} {counts[m]}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}
