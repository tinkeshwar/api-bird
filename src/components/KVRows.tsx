"use client";

import { useState } from "react";
import type { KV } from "@/lib/db";

// Editable key/value rows. Renders `${name}.key` / `${name}.value` inputs for form posts,
// and reports changes through onChange for controlled parents.
export function KVRows({ name, initial = [], onChange }: { name: string; initial?: KV[]; onChange?: (rows: KV[]) => void }) {
  const [rows, setRows] = useState<KV[]>(initial);
  const set = (next: KV[]) => {
    setRows(next);
    onChange?.(next);
  };

  return (
    <div className="space-y-1">
      {rows.map((r, i) => (
        <div key={i} className="flex gap-1">
          <input
            name={`${name}.key`}
            value={r.key}
            placeholder="key"
            onChange={(e) => set(rows.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}
            className="input flex-1 font-mono"
          />
          <input
            name={`${name}.value`}
            value={r.value}
            placeholder="value"
            onChange={(e) => set(rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
            className="input flex-1 font-mono"
          />
          <button type="button" onClick={() => set(rows.filter((_, j) => j !== i))} className="btn" aria-label="Remove row">
            ×
          </button>
        </div>
      ))}
      <button type="button" onClick={() => set([...rows, { key: "", value: "" }])} className="btn">
        + {name === "headers" ? "header" : "param"}
      </button>
    </div>
  );
}
