import { test } from "node:test";
import assert from "node:assert/strict";
import { parseOpenApi } from "./openapi.ts";

const spec = `
openapi: 3.0.0
info: { title: t, version: "1" }
paths:
  /pets:
    get:
      summary: List pets
      parameters:
        - $ref: "#/components/parameters/Limit"
        - { name: X-Trace, in: header, example: abc }
    post:
      operationId: createPet
      requestBody:
        content:
          application/json:
            example: { name: Rex }
  /pets/{id}:
    parameters:
      - { name: id, in: path, required: true }
    delete: {}
components:
  parameters:
    Limit: { name: limit, in: query, example: 10 }
`;

test("extracts endpoints from an OpenAPI spec", () => {
  const eps = parseOpenApi(spec);
  assert.equal(eps.length, 3);
  const [list, create, del] = eps;

  assert.deepEqual(list, {
    method: "GET",
    path: "/pets",
    name: "List pets",
    query: [{ key: "limit", value: "10" }],
    headers: [{ key: "X-Trace", value: "abc" }],
  });

  assert.equal(create.method, "POST");
  assert.equal(create.name, "createPet");
  assert.equal(create.body, JSON.stringify({ name: "Rex" }, null, 2));
  assert.deepEqual(create.headers, [{ key: "Content-Type", value: "application/json" }]);

  assert.equal(del.method, "DELETE");
  assert.equal(del.path, "/pets/{id}");
  assert.equal(del.name, "DELETE /pets/{id}");
  assert.deepEqual(del.query, []);
  assert.equal(del.body, undefined);
});

test("rejects non-OpenAPI documents", () => {
  assert.throws(() => parseOpenApi(`{"hello": "world"}`), /Not an OpenAPI document/);
  assert.throws(() => parseOpenApi(`openapi: 3.0.0`), /Not an OpenAPI document/);
  assert.throws(() => parseOpenApi(`: : [`), /Not an OpenAPI document/);
});
