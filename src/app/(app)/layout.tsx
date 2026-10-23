import Link from "next/link";

// Navbar for every page except the landing page, which has its own hero.
export default function AppLayout({ children, crumb }: LayoutProps<"/">) {
  return (
    <>
      <header className="topbar sticky top-0 z-10 border-b border-line bg-surface/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center px-6">
          <Link href="/" className="group -ml-1 flex items-center gap-2 rounded-lg py-1 pr-2 pl-1 transition-colors hover:bg-surface-2">
            <span
              className="grid size-7 place-items-center rounded-lg text-[11px] font-bold text-white shadow-sm"
              style={{ background: "linear-gradient(135deg, var(--c-indigo), var(--c-violet) 60%, var(--c-cyan))" }}
            >
              AB
            </span>
            <span className="font-semibold text-muted transition-colors group-hover:text-fg">API Bird</span>
          </Link>
          {crumb}
        </div>
      </header>
      <main className="mx-auto max-w-7xl space-y-6 p-6">{children}</main>
    </>
  );
}
