import { test } from "node:test";
import assert from "node:assert/strict";
import { normBasePath, requestHash, serviceUrl, type RunInput } from "./db.ts";

test("normBasePath", () => {
  assert.equal(normBasePath(""), "");
  assert.equal(normBasePath(" / "), "");
  assert.equal(normBasePath("/api/v1/"), "/api/v1");
  assert.equal(normBasePath("/api/v1"), "/api/v1");
  assert.equal(normBasePath("api/v1"), null);
  assert.equal(normBasePath("/a b"), null);
  assert.equal(normBasePath("/a?x=1"), null);
  assert.equal(normBasePath("/a#b"), null);
});

test("serviceUrl", () => {
  assert.equal(serviceUrl({ protocol: "http", host: "localhost", port: 4000 }), "http://localhost:4000");
  assert.equal(serviceUrl({ protocol: "https", host: "x", port: 443, basePath: "/api/v1" }) + "/users", "https://x:443/api/v1/users");
});

test("requestHash", () => {
  const base: RunInput = {
    method: "post",
    path: "/users/{id}/{org}",
    params: { id: "1", org: "a" },
    query: [{ key: "q", value: "x" }],
    headers: [{ key: "X-A", value: "1" }],
    body: "{}",
    skipHeaders: ["a", "b"],
  };
  const h = requestHash(base);
  const same = (o: Partial<RunInput>) => assert.equal(requestHash({ ...base, ...o }), h);
  const diff = (o: Partial<RunInput>) => assert.notEqual(requestHash({ ...base, ...o }), h);
  same({ method: "POST" });
  same({ query: [{ key: " ", value: "junk" }, ...base.query], headers: [...base.headers, { key: "", value: "" }] });
  same({ skipHeaders: ["b", "a"] });
  same({ params: { org: "a", id: "1", unused: "z" } });
  diff({ body: "{ }" });
  diff({ query: [{ key: "q", value: "y" }] });
  diff({ headers: [{ key: "X-A", value: "2" }] });
  diff({ params: { id: "2", org: "a" } });
  diff({ noAuth: true });
  // No body on GET, so it's ignored.
  assert.equal(requestHash({ ...base, method: "GET", body: "a" }), requestHash({ ...base, method: "GET", body: "b" }));
});
