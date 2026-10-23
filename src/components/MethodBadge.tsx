const HUE: Record<string, string> = { GET: "green", POST: "blue", PUT: "amber", PATCH: "violet", DELETE: "red" };
export const methodColor = (m: string) => `var(--c-${HUE[m] ?? "gray"})`;

export function MethodBadge({ method }: { method: string }) {
  return (
    <span
      className="badge inline-block w-16 rounded px-1 text-center font-mono text-xs font-semibold"
      style={{ "--b": methodColor(method) } as React.CSSProperties}
    >
      {method}
    </span>
  );
}
