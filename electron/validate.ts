import net from "node:net";

// client.db() falls back to "test" when the URI has no database name.
export function uriError(uri: string): string | null {
  const m = /^mongodb(\+srv)?:\/\/(.*)$/.exec(uri.trim());
  if (!m) return "URI must start with mongodb:// or mongodb+srv://";
  const slash = m[2].indexOf("/"); // "/" in credentials must be percent-encoded, so the first one starts the path
  const name = slash < 0 ? "" : m[2].slice(slash + 1).split("?")[0];
  return name ? null : "Add a database name, e.g. …/api-bird";
}

export function portError(port: number): string | null {
  return Number.isInteger(port) && port >= 1024 && port <= 65535 ? null : "Port must be a whole number from 1024 to 65535";
}

export const portFree = (port: number) =>
  new Promise<boolean>((resolve) => {
    const s = net.createServer().once("error", () => resolve(false));
    s.listen(port, "127.0.0.1", () => s.close(() => resolve(true)));
  });

// Numeric semver compare of "1.2.3" style versions; a leading "v" is ignored.
export function isNewer(tag: string, current: string): boolean {
  const parse = (v: string) => String(v).replace(/^v/, "").split(".").map((n) => parseInt(n, 10) || 0);
  const [a, b] = [parse(tag), parse(current)];
  for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  return false;
}
