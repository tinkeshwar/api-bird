import { test } from "node:test";
import assert from "node:assert/strict";
import { formFields, isMultipart } from "./multipart.ts";

test("isMultipart matches the Content-Type header in any case, with params", () => {
  assert.equal(isMultipart([{ key: " content-type", value: "Multipart/Form-Data; boundary=x" }]), true);
  assert.equal(isMultipart([{ key: "Content-Type", value: "application/json" }]), false);
});

test("formFields keeps valid fields and treats non-arrays as no fields", () => {
  assert.deepEqual(formFields('[{"key":"a","value":"1"},{"key":"f","value":"x.png","file":true},{"nope":1}]'), [
    { key: "a", value: "1" },
    { key: "f", value: "x.png", file: true },
  ]);
  assert.deepEqual(formFields('{"a":1}'), []);
  assert.deepEqual(formFields("not json"), []);
});
