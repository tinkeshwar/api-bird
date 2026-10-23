"use server";

import type { Result, RunInput, RunResult } from "@/app/actions";

// Prototype-only: pretends to save so /dev forms can show pending and close-on-success.
export async function mockSave(_: Result, fd: FormData): Promise<Result> {
  await new Promise((r) => setTimeout(r, 600));
  if (fd.get("name") === "fail") return { error: "Mock error (name was 'fail')" };
  return { ok: true };
}

// Prototype-only: fakes a response. A path containing "fail" returns a network error, "missing" a 404.
export async function mockRun(_: string, o: RunInput): Promise<RunResult> {
  await new Promise((r) => setTimeout(r, 700));
  if (o.path.includes("fail")) return { error: "connect ECONNREFUSED 127.0.0.1:8443", durationMs: 12 };
  const status = o.path.includes("missing") ? 404 : o.method === "POST" ? 201 : 200;
  const body = status === 404 ? { error: "Not found" } : { id: o.params.id || "inv_123", status: "paid", total: 4200, currency: "EUR", lines: [{ sku: "A-1", qty: 2 }], echo: { query: o.query, body: o.body || null } };
  return {
    status,
    statusText: status === 404 ? "Not Found" : status === 201 ? "Created" : "OK",
    headers: { "content-type": "application/json", "x-request-id": "req_8f2c1a", date: new Date().toUTCString(), "cache-control": "no-store" },
    body: JSON.stringify(body),
    durationMs: 84,
  };
}
