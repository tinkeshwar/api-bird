// Kept free of Next/Mongo imports so `node --test` can load it directly.

import type { Var } from "./db.ts";

// Safe as a Mongo key: no leading $, no dots.
export const VAR_NAME = /^[A-Za-z_][\w-]*$/;
const REF = /\{\{([A-Za-z_][\w-]*)\}\}/g;

// Names used as {{name}} in text, each once, in order of first use.
export const refs = (text: string) => [...new Set([...text.matchAll(REF)].map((m) => m[1]))];

// Substitutes defined vars (an empty value counts as defined); unknown refs stay as-is and are reported.
export function fill(text: string, vars: Record<string, Var>) {
  const missing = new Set<string>();
  const out = text.replace(REF, (m, n: string) => {
    if (Object.hasOwn(vars, n)) return vars[n].value;
    missing.add(n);
    return m;
  });
  return { text: out, missing: [...missing] };
}
