import { test } from "node:test";
import assert from "node:assert/strict";
import { mask, maskAuth, maskVars } from "./tools.ts";
import { checkEndpoint } from "../lib/db.ts";

test("mask hides secret vars and literal auth values, leaves {{refs}} alone", () => {
  assert.equal(mask("abc"), "••••");
  assert.equal(mask("{{token}}"), "{{token}}");
  assert.equal(mask("Bearer {{token}}"), "••••");
  assert.equal(mask(""), "");
  assert.deepEqual(maskVars({ a: { value: "x", secret: true }, b: { value: "y" }, c: { value: "{{a}}", secret: true } }), {
    a: { value: "••••", secret: true },
    b: { value: "y" },
    c: { value: "{{a}}", secret: true },
  });
  assert.deepEqual(maskAuth({ type: "basic", username: "u", password: "p" }), { type: "basic", username: "u", password: "••••" });
  assert.deepEqual(maskAuth({ type: "bearer", token: "{{token}}" }), { type: "bearer", token: "{{token}}" });
  assert.deepEqual(maskAuth({ type: "apikey", in: "header", name: "X-Key", value: "k" }), { type: "apikey", in: "header", name: "X-Key", value: "••••" });
  assert.equal(maskAuth(undefined), undefined);
});

test("checkEndpoint rejects bad method, relative path and empty name; normalizes a valid one", () => {
  const ok = { method: "get", path: " /users/{id} ", name: " Get user ", headers: [{ key: " X-A ", value: "1" }, { key: "", value: "x" }], body: "", description: " " };
  assert.equal("error" in checkEndpoint({ ...ok, method: "FETCH" }), true);
  assert.equal("error" in checkEndpoint({ ...ok, path: "users" }), true);
  assert.equal("error" in checkEndpoint({ ...ok, name: "  " }), true);
  assert.deepEqual(checkEndpoint(ok), { method: "GET", path: "/users/{id}", name: "Get user", headers: [{ key: "X-A", value: "1" }], query: [], noAuth: false, skipHeaders: [] });
});
