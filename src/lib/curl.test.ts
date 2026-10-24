import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCurl } from "./curl.ts";

test("parseCurl reads method, headers and multi-line body, stripping the base path", () => {
  const e = parseCurl(
    `curl -X 'POST' \\
  'http://localhost:5001/api/auth/login?x=1' \\
  -H 'accept: application/json' \\
  -H 'Content-Type: application/json' \\
  -d '{
  "username": "johndoe"
}'`,
    "/api",
  );
  assert.equal(e.method, "POST");
  assert.equal(e.path, "/auth/login");
  assert.deepEqual(e.query, [{ key: "x", value: "1" }]);
  assert.deepEqual(e.headers, [
    { key: "accept", value: "application/json" },
    { key: "Content-Type", value: "application/json" },
  ]);
  assert.equal(e.body, '{\n  "username": "johndoe"\n}');
});

test("parseCurl defaults the method, handles double quotes, forms and bad input", () => {
  assert.equal(parseCurl(`curl -s "example.com/a/%7Bid%7D" -H "X-A: \\"q\\""`).method, "GET");
  assert.equal(parseCurl(`curl example.com/a/%7Bid%7D`).path, "/a/{id}");
  assert.equal(parseCurl(`curl -d a=1 example.com`).method, "POST");
  const f = parseCurl(`curl -F name=x -F 'f=@/tmp/pic.png;type=image/png' example.com/up`);
  assert.equal(f.body, '[{"key":"name","value":"x"},{"key":"f","value":"pic.png","file":true}]');
  assert.deepEqual(f.headers, [{ key: "Content-Type", value: "multipart/form-data" }]);
  assert.equal(parseCurl("curl -X POST \\\r\n  'http://h/api/x'", "/api").path, "/x");
  assert.throws(() => parseCurl("wget x"), /curl/);
  assert.throws(() => parseCurl("curl -X GET"), /URL/);
});
