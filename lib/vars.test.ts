import { test } from "node:test";
import assert from "node:assert/strict";
import { fill, refs, VAR_NAME } from "./vars.ts";

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
