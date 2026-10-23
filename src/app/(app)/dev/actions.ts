"use server";

import type { Result, RunInput, RunResult } from "@/app/actions";
import { requestHash, type Capture } from "@/lib/db";

// Prototype-only: pretends to save so /dev forms can show pending and close-on-success.
export async function mockSave(_: Result, fd: FormData): Promise<Result> {
  await new Promise((r) => setTimeout(r, 600));
  if (fd.get("name") === "fail") return { error: "Mock error (name was 'fail')" };
  return { ok: true };
}

// Prototype-only: pretends to add/remove a capture rule. A var named "fail" errors.
export async function mockCapture(_: string, c: Capture): Promise<Result> {
  await new Promise((r) => setTimeout(r, 400));
  return c.var === "fail" ? { error: "Mock error (variable was 'fail')" } : { ok: true };
}
// Prototype-only: pretends to rename/delete a saved request. A label "fail" errors.
export async function mockRename(_: string, label: string): Promise<Result> {
  await new Promise((r) => setTimeout(r, 300));
  return label.trim() === "fail" ? { error: "Mock error (label was 'fail')" } : { ok: true };
}
export async function mockLock(): Promise<Result> {
  await new Promise((r) => setTimeout(r, 300));
  return { ok: true };
}
export async function mockRemove(): Promise<Result> {
  await new Promise((r) => setTimeout(r, 300));
  return { ok: true };
}
export async function mockUncapture(): Promise<Result> {
  await new Promise((r) => setTimeout(r, 300));
  return { ok: true };
}

// Prototype-only: fakes a response. A path containing "fail" returns a network error, "missing" a 404,
// "expired" a token refresh via a producer, "relogin" a failed refresh.
export async function mockRun(_: string, o: RunInput): Promise<RunResult> {
  await new Promise((r) => setTimeout(r, 700));
  if (o.path.includes("fail")) return { error: "connect ECONNREFUSED 127.0.0.1:8443", durationMs: 12 };
  if (o.path.includes("relogin")) return { error: "Refreshing {{accessToken}} via Auth › Login failed: 401 Unauthorized", durationMs: 140 };
  const status = o.path.includes("missing") ? 404 : o.method === "POST" ? 201 : 200;
  const body = status === 404 ? { error: "Not found" } : { id: o.params.id || "inv_123", status: "paid", total: 4200, currency: "EUR", lines: [{ sku: "A-1", qty: 2 }], data: { access_token: "eyJhbGciOiJIUzI1NiJ9.mock" }, echo: { query: o.query, body: o.body || null } };
  return {
    status,
    statusText: status === 404 ? "Not Found" : status === 201 ? "Created" : "OK",
    headers: { "content-type": "application/json", "x-request-id": "req_8f2c1a", "x-auth-token": "tok_mock", date: new Date().toUTCString(), "cache-control": "no-store" },
    body: JSON.stringify(body),
    ...(o.path.includes("expired") && { refreshed: [{ var: "accessToken", via: "Auth › Login" }] }),
    durationMs: 84,
    requestId: requestHash(o),
  };
}
