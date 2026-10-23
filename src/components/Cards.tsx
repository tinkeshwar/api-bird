import Link from "next/link";
import { methodColor } from "@/components/MethodBadge";
import { hueOf } from "@/components/ProjectIcon";
import { METHODS } from "@/lib/methods";

// Service as an airmail envelope: host and base path as the address, endpoint count on the stamp, protocol as
// its postmark, method mix along the bottom. The name link stretches over the tile; `edit` sits above it.
export function ServiceCard({ href, name, url, methods, edit }: { href: string; name: string; url: string; edit?: React.ReactNode; methods: Record<string, number> }) {
  const u = new URL(url);
  const total = Object.values(methods).reduce((a, b) => a + b, 0);
  const mix = METHODS.filter((m) => methods[m]);
  const secure = u.protocol === "https:";

  return (
    <div className="envelope group" style={{ "--hue": hueOf(name) } as React.CSSProperties}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1 space-y-1 pt-1">
          <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-subtle uppercase">To</p>
          <Link href={href} className="block truncate text-base font-semibold text-fg after:absolute after:inset-0">
            {name}
          </Link>
          <p className="truncate font-mono text-xs" title={url}>
            <span className="text-muted">{u.host}</span>
            <span className="text-accent-text">{u.pathname === "/" ? "" : u.pathname}</span>
          </p>
        </div>
        <div className="relative shrink-0">
          <div className="stamp-wrap">
            <div className="stamp stamp-sm">
              <div className="stamp-face">
                <span className="font-mono text-xl leading-none font-semibold text-fg tabular-nums">{total}</span>
                <span className="text-[9px] font-bold tracking-[0.14em] uppercase" style={{ color: "var(--hue)" }}>
                  endpoint{total === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          </div>
          <span className="postmark absolute -bottom-3 -left-7 size-9 text-[8px]" style={{ "--b": secure ? "var(--c-green)" : "var(--c-amber)" } as React.CSSProperties} title={secure ? "HTTPS" : "Plain HTTP"}>
            {secure ? "HTTPS" : "HTTP"}
          </span>
        </div>
      </div>

      <div className="space-y-2 border-t border-dashed border-line-strong pt-3">
        <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full bg-surface-2">
          {mix.map((m) => (
            <span key={m} title={`${methods[m]} ${m}`} style={{ flexGrow: methods[m], background: methodColor(m) }} />
          ))}
        </div>
        <div className="flex items-center gap-3">
          <p className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-0.5 font-mono text-[11px] tabular-nums">
            {mix.length ? (
              mix.map((m) => (
                <span key={m}>
                  <span className="font-bold" style={{ color: methodColor(m) }}>
                    {m}
                  </span>{" "}
                  <span className="text-muted">{methods[m]}</span>
                </span>
              ))
            ) : (
              <span className="text-subtle">No endpoints yet</span>
            )}
          </p>
          {edit && <div className="relative z-10 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">{edit}</div>}
        </div>
      </div>
    </div>
  );
}
