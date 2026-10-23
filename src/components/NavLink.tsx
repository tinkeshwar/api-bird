"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Sidebar row; "/" matches only itself, anything else also matches its subpages.
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors ${active ? "bg-accent-soft font-semibold text-accent-text" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
    >
      {children}
    </Link>
  );
}
