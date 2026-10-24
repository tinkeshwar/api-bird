"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeftIcon } from "@/components/Icons";

// "Up one level" above page content: every route nests in /kind/id pairs, so the parent is the path minus two segments.
// `path` overrides the current URL (for /dev).
export function BackLink({ path }: { path?: string }) {
  const current = usePathname();
  const p = path ?? current;
  if (p === "/") return null;
  const href = p.split("/").slice(0, -2).join("/") || "/";
  return (
    <Link
      href={href}
      aria-label="Back"
      title="Back"
      className="-ml-1 flex w-fit items-center gap-1 rounded-md py-1 pr-2 pl-1 text-sm font-semibold text-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      <ChevronLeftIcon />
      Back
    </Link>
  );
}
