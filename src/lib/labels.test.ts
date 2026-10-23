import { test } from "node:test";
import assert from "node:assert/strict";
import { suggestLabel } from "./labels.ts";

const req = (o: Partial<Parameters<typeof suggestLabel>[0]> = {}) => ({
  method: "PATCH", path: "/{{tenant}}/invoices/{id}", params: { id: "inv_1", stale: "x" }, query: [], headers: [], body: "{}", ...o,
});

test("2xx uses the endpoint name, then what makes the request distinct", () => {
  assert.equal(suggestLabel(req({ query: [{ key: "expand", value: "lines" }, { key: " ", value: "" }] }), 200, { name: "Update invoice" }), "Update invoice: id=inv_1, expand=lines");
});

test("2xx falls back to description, then method intent, when the name is auto-generated", () => {
  const r = req({ method: "GET", path: "/invoices", params: {} });
  assert.equal(suggestLabel(r, 200, { name: "GET /invoices", description: "Lists all invoices. Paginated." }), "Lists all invoices");
  assert.equal(suggestLabel(r, 200, { name: "GET /invoices" }), "Fetch invoices");
});

test("errors prefer the response message, then the status phrase", () => {
  assert.equal(suggestLabel(req(), 409, { responseBody: '{"error":"Invoice is locked"}' }), "Invoice is locked: id=inv_1");
  assert.equal(suggestLabel(req({ body: " ", noAuth: true, skipHeaders: ["X-Tenant"] }), 401), "Unauthenticated: id=inv_1, empty body, no auth, no X-Tenant");
  assert.equal(suggestLabel(req(), 503), "Server error: id=inv_1");
});

test("long labels are cut to 60 chars", () => {
  const l = suggestLabel(req({ params: { id: "x".repeat(80) } }), 404);
  assert.equal(l.length, 60);
  assert.ok(l.endsWith("…"));
});
