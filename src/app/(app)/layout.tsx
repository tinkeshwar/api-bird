import Link from "next/link";
import { connection } from "next/server";
import { BackLink } from "@/components/BackLink";
import { NavLink } from "@/components/NavLink";
import { ProjectIcon } from "@/components/ProjectIcon";
import { projects } from "@/lib/db";
import { version } from "../../../package.json";

// Desktop window: full-width title bar (window buttons, drag area), airmail stripe, sidebar, status bar.
export default async function AppLayout({ children }: LayoutProps<"/">) {
  await connection();
  // An unreachable DB still renders the shell (and the no-DB /dev page); the status bar says so.
  const list = await projects()
    .then((c) => c.find({}, { projection: { name: 1, icon: 1 } }).sort({ name: 1 }).toArray())
    .catch(() => null);
  const mcp = `http://127.0.0.1:${process.env.PORT ?? 3000}/api/mcp`;

  return (
    <div className="flex h-full flex-col">
      <header className="drag h-11 shrink-0 bg-sidebar" />
      <div className="airmail h-1 shrink-0" aria-hidden />
      <div className="flex min-h-0 flex-1">
        <aside className="flex w-56 shrink-0 flex-col border-r border-line bg-sidebar select-none">
          <div className="flex h-14 shrink-0 items-center px-3">
            <Link href="/" className="flex items-center gap-2 font-semibold">
              <img src="/logo.svg" alt="" className="h-9 w-auto shrink-0" />
              <span className="whitespace-nowrap">
                API Bird<sup className="ml-0.5 font-mono text-[9px] font-normal text-subtle"> v{version}</sup>
              </span>
            </Link>
          </div>
          <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
            <NavLink href="/">Overview</NavLink>
            <h2 className="px-2 pt-4 pb-1 text-[11px] font-bold tracking-[0.1em] text-subtle uppercase">Projects</h2>
            {list?.map((p) => (
              <NavLink key={String(p._id)} href={`/projects/${p._id}`}>
                <ProjectIcon icon={p.icon} name={p.name} size={18} />
                <span className="truncate">{p.name}</span>
              </NavLink>
            ))}
            {list?.length === 0 && <p className="px-2 text-xs text-subtle">None</p>}
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <main className="watermark min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-6xl space-y-6 p-6">
              <BackLink />
              {children}
            </div>
          </main>
          <footer className="flex h-6 shrink-0 items-center gap-3 border-t border-line bg-sidebar px-3 font-mono text-[11px] text-muted select-none">
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full" style={{ background: list ? "var(--c-green)" : "var(--c-red)" }} />
              {list ? "DB connected" : "DB unreachable"}
            </span>
            <span className="ml-auto truncate">MCP {mcp}</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
