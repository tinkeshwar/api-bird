import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { portError, portFree, uriError } from "./validate.ts";

test("uriError", () => {
  assert.equal(uriError("mongodb://localhost:27017/api-bird"), null);
  assert.equal(uriError("mongodb+srv://u:p%2Fx@c.example.net/api-bird?retryWrites=true"), null);
  assert.equal(uriError("mongodb://a:1,b:2/api-bird?replicaSet=rs"), null);
  assert.match(uriError("mongodb://localhost:27017")!, /database name/);
  assert.match(uriError("mongodb://localhost:27017/")!, /database name/);
  assert.match(uriError("mongodb://localhost:27017/?x=1")!, /database name/);
  assert.match(uriError("mongodb://localhost?x=1")!, /database name/);
  assert.match(uriError("http://localhost/api-bird")!, /must start/);
});

test("portError", () => {
  assert.equal(portError(3940), null);
  assert.equal(portError(1024), null);
  assert.equal(portError(65535), null);
  assert.ok(portError(80));
  assert.ok(portError(65536));
  assert.ok(portError(3940.5));
  assert.ok(portError(NaN));
});

test("portFree", async () => {
  const s = net.createServer();
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  const port = (s.address() as net.AddressInfo).port;
  assert.equal(await portFree(port), false);
  await new Promise((r) => s.close(r));
  assert.equal(await portFree(port), true);
});
