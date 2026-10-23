import { test } from "node:test";
import assert from "node:assert/strict";
import { applyAuth, captureValues, fill, pick, refs, VAR_NAME, varNameFor } from "./vars.ts";

test("refs lists each {{name}} once", () => {
  assert.deepEqual(refs("Bearer {{token}} {{api-key}} {{token}} {{_x_1}}"), ["token", "api-key", "_x_1"]);
  assert.deepEqual(refs("{id} {{ spaced }} {{1bad}} {single}"), []);
});

test("fill substitutes repeated, empty and -/_ names, and reports unknown ones", () => {
  const vars = { token: { value: "abc", secret: true }, "api-key": { value: "k" }, _empty: { value: "" } };
  assert.deepEqual(fill("{{token}}:{{token}} {{api-key}} [{{_empty}}]", vars), { text: "abc:abc k []", missing: [] });
  assert.deepEqual(fill("{{nope}} {{token}} {{nope}} {{other}}", vars), { text: "{{nope}} abc {{nope}} {{other}}", missing: ["nope", "other"] });
  assert.deepEqual(fill("{{toString}}", vars).missing, ["toString"]);
});

test("VAR_NAME rejects Mongo-unsafe names", () => {
  for (const ok of ["a", "_a", "api-key", "A_1"]) assert.ok(VAR_NAME.test(ok), ok);
  for (const bad of ["", "1a", "$set", "a.b", "-a", "a b"]) assert.ok(!VAR_NAME.test(bad), bad);
});

test("applyAuth builds bearer, basic and api-key auth; explicit rows win", () => {
  const h: [string, string][] = [["Accept", "*/*"]];
  assert.deepEqual(applyAuth(undefined, h, []), { headers: h, query: [] });
  assert.deepEqual(applyAuth({ type: "none" }, h, []), { headers: h, query: [] });
  assert.deepEqual(applyAuth({ type: "bearer", token: "abc" }, h, []).headers, [...h, ["Authorization", "Bearer abc"]]);
  assert.deepEqual(applyAuth({ type: "basic", username: "ü", password: "p:w" }, [], []).headers, [["Authorization", `Basic ${Buffer.from("ü:p:w").toString("base64")}`]]);
  assert.deepEqual(applyAuth({ type: "apikey", in: "header", name: "X-Key", value: "k" }, [], []), { headers: [["X-Key", "k"]], query: [] });
  assert.deepEqual(applyAuth({ type: "apikey", in: "query", name: "key", value: "k" }, [], [["a", "1"]]), { headers: [], query: [["a", "1"], ["key", "k"]] });
  assert.deepEqual(applyAuth({ type: "bearer", token: "abc" }, [["authorization", "Bearer mine"]], []).headers, [["authorization", "Bearer mine"]]);
  assert.deepEqual(applyAuth({ type: "apikey", in: "query", name: "key", value: "k" }, [], [["key", "mine"]]).query, [["key", "mine"]]);
});

test("pick reads PLAIN-view paths", () => {
  const body = JSON.stringify({ data: { accessToken: "t", n: 1, o: { a: null } }, lines: [{ id: "l1" }], e: "" });
  assert.equal(pick(body, "data.accessToken"), "t");
  assert.equal(pick(body, "lines[0].id"), "l1");
  assert.equal(pick(body, "data.n"), "1");
  assert.equal(pick(body, "data.o"), '{"a":null}');
  assert.equal(pick(body, "data.o.a"), "null");
  assert.equal(pick(body, "e"), "");
  assert.equal(pick(JSON.stringify([{ id: 7 }]), "[0].id"), "7");
  for (const missing of ["data.nope", "lines[1].id", "lines[0].id.x", "data.accessToken.length", "toString"]) assert.equal(pick(body, missing), undefined, missing);
  assert.equal(pick("<html>nope</html>", "data"), undefined);
});

test("varNameFor suggests a valid camelCase name", () => {
  assert.equal(varNameFor("data.access_token"), "accessToken");
  assert.equal(varNameFor("data.accessToken"), "accessToken");
  assert.equal(varNameFor("x-auth-token"), "xAuthToken");
  assert.equal(varNameFor("lines[0]"), "lines");
  assert.equal(varNameFor("[0]"), "value");
  assert.equal(varNameFor("data.2fa"), "_2fa");
  for (const p of ["a.b-c_d", "[3].9", "x-auth-token"]) assert.ok(VAR_NAME.test(varNameFor(p)), p);
});

test("captureValues reads body paths and headers (any case), skipping missing ones", () => {
  const caps = [
    { var: "token", from: "body", path: "data.token" },
    { var: "rid", from: "header", path: "X-Request-Id" },
    { var: "gone", from: "body", path: "data.nope" },
    { var: "gone2", from: "header", path: "x-nope" },
  ] as const;
  assert.deepEqual(captureValues([...caps], '{"data":{"token":"t"}}', { "x-request-id": "r1" }), { token: "t", rid: "r1" });
  assert.deepEqual(captureValues([...caps], "not json", {}), {});
});
