import Link from "next/link";
import { DownloadIcon, EyeIcon, PencilIcon, PlugIcon, PlusIcon, RefreshIcon, ServerIcon, SlidersIcon, TrashIcon } from "@/components/Icons";
import { methodColor } from "@/components/MethodBadge";
import { hueOf, ProjectIcon } from "@/components/ProjectIcon";

type Icon = (p: { size?: number }) => React.ReactNode;

function Chip({ n, label, Icon, color }: { n: number; label: string; Icon: Icon; color: string }) {
  return (
    <div className={`status-chip ${n ? "" : "is-empty"}`} style={{ "--sc": color } as React.CSSProperties} title={`${n} ${label}`} aria-label={`${n} ${label}`}>
      <span className="chip-face">
        <Icon size={14} />
        <span className="text-sm leading-none font-semibold tabular-nums">{n}</span>
      </span>
      <span className="chip-label" aria-hidden>
        {label}
      </span>
    </div>
  );
}

// Sits above the stretched title link so chips get hover; it links to the same page, kept out of tab order.
function Chips({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} tabIndex={-1} className="relative z-10 grid auto-cols-fr grid-flow-col gap-1.5">
      {children}
    </Link>
  );
}

// The title link stretches over the whole card via ::after; `edit` sits above it so its button stays clickable
// (a button nested inside an <a> is invalid HTML).
function Card({ href, name, icon, sub, edit, children }: { href: string; name: string; icon?: string; sub?: string; edit?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="card project-card group gap-4" style={{ "--hue": hueOf(name) } as React.CSSProperties}>
      <div className="flex items-center gap-3">
        <ProjectIcon icon={icon} name={name} size={44} />
        <div className="min-w-0 flex-1">
          <Link href={href} className="block truncate font-semibold text-fg after:absolute after:inset-0">
            {name}
          </Link>
          {sub && <p className="truncate font-mono text-xs text-muted">{sub}</p>}
        </div>
        {edit && <div className="relative z-10 opacity-60 transition-opacity group-hover:opacity-100 focus-within:opacity-100">{edit}</div>}
      </div>
      {children}
    </div>
  );
}

export function ProjectCard({ services, endpoints, ...card }: { href: string; name: string; icon?: string; edit?: React.ReactNode; services: number; endpoints: number }) {
  return (
    <Card {...card}>
      <Chips href={card.href}>
        <Chip n={services} label="Services" Icon={ServerIcon} color="var(--c-indigo)" />
        <Chip n={endpoints} label="Endpoints" Icon={PlugIcon} color="var(--c-cyan)" />
      </Chips>
    </Card>
  );
}

const METHOD_ICONS: Record<string, Icon> = { GET: DownloadIcon, POST: PlusIcon, PUT: RefreshIcon, PATCH: PencilIcon, DELETE: TrashIcon, HEAD: EyeIcon, OPTIONS: SlidersIcon };

// The common five always get a chip (0 when absent) so tiles line up; HEAD/OPTIONS only show when used.
const ALWAYS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

export function ServiceCard({ url, methods, ...card }: { href: string; name: string; url: string; edit?: React.ReactNode; methods: Record<string, number> }) {
  const shown = [...ALWAYS, ...Object.keys(methods).filter((m) => !ALWAYS.includes(m))];
  return (
    <Card {...card} sub={url}>
      <Chips href={card.href}>
        {shown.map((m) => (
          <Chip key={m} n={methods[m] ?? 0} label={m} Icon={METHOD_ICONS[m] ?? SlidersIcon} color={methodColor(m)} />
        ))}
      </Chips>
    </Card>
  );
}
