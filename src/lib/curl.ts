import type { EndpointInput, KV } from "./db.ts";

// Shell-style split: '…' is literal, "…" and bare words honour backslash escapes, "\<newline>" joins lines.
function tokens(s: string) {
  const out: string[] = [];
  let cur: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "\\" && s[i + 1] === "\n") i++;
    else if (/\s/.test(c)) {
      if (cur !== null) out.push(cur);
      cur = null;
    } else if (c === "'") {
      const end = s.indexOf("'", i + 1);
      if (end < 0) throw new Error("Unclosed ' quote");
      cur = (cur ?? "") + s.slice(i + 1, end);
      i = end;
    } else if (c === '"') {
      cur ??= "";
      for (i++; s[i] !== '"'; i++) {
        if (i >= s.length) throw new Error('Unclosed " quote');
        if (s[i] === "\\" && /["\\$`]/.test(s[i + 1])) i++;
        cur += s[i];
      }
    } else if (c === "\\") cur = (cur ?? "") + (s[++i] ?? "");
    else cur = (cur ?? "") + c;
  }
  if (cur !== null) out.push(cur);
  return out;
}

const DATA = ["-d", "--data", "--data-raw", "--data-binary", "--data-ascii", "--data-urlencode", "--json"];
// Flags whose value isn't used here but must not be mistaken for the URL.
const SKIP_ARG = ["-o", "--output", "-u", "--user", "-e", "--referer", "-m", "--max-time", "--connect-timeout", "-x", "--proxy", "-w", "--write-out", "--cert", "--key", "--cacert", "-T", "--upload-file"];

// Parses a `curl …` command into an endpoint. basePath (the service's) is stripped from the URL path.
export function parseCurl(cmd: string, basePath = ""): EndpointInput {
  // Textareas submit CRLF; without this "\<CR>" becomes a stray token taken as the URL.
  const args = tokens(cmd.replace(/\r\n?/g, "\n").trim());
  if (args[0] !== "curl") throw new Error("Paste a command starting with curl");
  let method = "";
  let url = "";
  const headers: KV[] = [];
  const data: string[] = [];
  const form: { key: string; value: string; file?: boolean }[] = [];
  const header = (key: string, value: string) => headers.push({ key, value });
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    const next = () => args[++i] ?? "";
    if (a === "-X" || a === "--request") method = next();
    else if (a === "-H" || a === "--header") {
      const h = next();
      const at = h.indexOf(":");
      if (at > 0) header(h.slice(0, at).trim(), h.slice(at + 1).trim());
    } else if (DATA.includes(a)) {
      if (a === "--json") header("Content-Type", "application/json");
      data.push(next());
    } else if (a === "-F" || a === "--form") {
      const f = next();
      const at = f.indexOf("=");
      const value = f.slice(at + 1);
      // @file → a file field; only the name is kept, like the form editor does.
      form.push(value.startsWith("@") ? { key: f.slice(0, at), value: value.slice(1).split(";")[0].split("/").pop()!, file: true } : { key: f.slice(0, at), value });
    } else if (a === "-A" || a === "--user-agent") header("User-Agent", next());
    else if (a === "-b" || a === "--cookie") header("Cookie", next());
    else if (a === "--url") url = next();
    else if (SKIP_ARG.includes(a)) next();
    else if (!a.startsWith("-") && !url) url = a;
  }
  if (!url) throw new Error("No URL found in the curl command");
  const u = new URL(/^[a-z]+:\/\//i.test(url) ? url : `http://${url}`);
  // decodeURI keeps {id}-style placeholders readable after URL encoding them.
  let path = decodeURI(u.pathname);
  if (basePath && (path === basePath || path.startsWith(basePath + "/"))) path = path.slice(basePath.length) || "/";
  let body = data.join("&");
  if (form.length) {
    body = JSON.stringify(form);
    if (!headers.some((h) => h.key.toLowerCase() === "content-type")) header("Content-Type", "multipart/form-data");
  }
  method = (method || (body ? "POST" : "GET")).toUpperCase();
  return { method, path, name: `${method} ${path}`, headers, query: [...u.searchParams].map(([key, value]) => ({ key, value })), body };
}
