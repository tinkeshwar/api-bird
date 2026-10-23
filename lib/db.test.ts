import { test } from "node:test";
import assert from "node:assert/strict";
import { normBasePath, serviceUrl } from "./db.ts";

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
