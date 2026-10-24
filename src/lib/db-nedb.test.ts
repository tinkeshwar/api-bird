import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ObjectId } from "mongodb";

const dir = mkdtempSync(join(tmpdir(), "api-bird-nedb-"));
delete process.env.MONGODB_URI;
process.env.DATA_DIR = dir;
const { projects, endpoints, requests } = await import("./db.ts");

test.after(() => rmSync(dir, { recursive: true, force: true }));

test("insert, find, sort, projection, ObjectId round-trip", async () => {
  const c = await projects();
  const { insertedId: a } = await c.insertOne({ name: "a", vars: { x: { value: "1" } }, createdAt: new Date(1) });
  await c.insertOne({ name: "b", createdAt: new Date(2) });
  const list = await c.find({}, { projection: { vars: 0 } }).sort({ createdAt: -1 }).toArray();
  assert.deepEqual(list.map((p) => p.name), ["b", "a"]);
  assert.equal(list[1].vars, undefined);
  assert.ok(list[1]._id instanceof ObjectId && list[1]._id.equals(a));
  assert.ok(list[1].createdAt instanceof Date);
  assert.equal((await c.find({ _id: { $in: [a] } }).toArray()).length, 1);
  assert.equal(await c.countDocuments({ _id: a }), 1);
});

test("$set / $unset / $pull", async () => {
  const p = await projects();
  const { insertedId } = await p.insertOne({ name: "v", createdAt: new Date() });
  assert.equal((await p.updateOne({ _id: insertedId }, { $set: { "vars.t": { value: "x" } } })).matchedCount, 1);
  assert.equal((await p.findOne({ _id: insertedId }))!.vars!.t.value, "x");
  await p.updateOne({ _id: insertedId }, { $unset: { "vars.t": "" } });
  assert.deepEqual((await p.findOne({ _id: insertedId }))!.vars, {});
  assert.equal((await p.updateOne({ _id: new ObjectId() }, { $set: { name: "z" } })).matchedCount, 0);

  const e = await endpoints();
  const serviceId = new ObjectId();
  const base = { serviceId, method: "GET", path: "/p", name: "p", headers: [], query: [], source: "manual" as const, createdAt: new Date() };
  const { insertedId: eid } = await e.insertOne({ ...base, captures: [{ var: "a", from: "body", path: "x" }, { var: "b", from: "body", path: "y" }] });
  await e.updateOne({ _id: eid }, { $pull: { captures: { var: "a" } } });
  const ep = (await e.findOne({ _id: eid }))!;
  assert.deepEqual(ep.captures!.map((c) => c.var), ["b"]);
  assert.ok(ep.serviceId.equals(serviceId));
  assert.equal((await e.find({ "captures.0": { $exists: true } }).toArray()).length, 1);
});

test("findOneAndUpdate upsert", async () => {
  const r = await requests();
  const endpointId = new ObjectId();
  const run = (status: number) =>
    r.findOneAndUpdate(
      { endpointId, hash: "h" },
      { $set: { status, lastRunAt: new Date() }, $setOnInsert: { createdAt: new Date(5) } },
      { upsert: true, returnDocument: "after", projection: { _id: 1 } },
    );
  const first = (await run(200))!;
  const second = (await run(404))!;
  assert.ok(first._id.equals(second._id));
  const doc = (await r.findOne({ _id: first._id }))!;
  assert.equal(doc.status, 404);
  assert.equal(doc.createdAt.getTime(), 5);
  assert.ok(doc.endpointId.equals(endpointId));
});

test("bulkWrite upsert count and duplicate code 11000", async () => {
  const e = await endpoints();
  const serviceId = new ObjectId();
  const op = (path: string) => ({
    updateOne: { filter: { serviceId, method: "GET", path }, update: { $setOnInsert: { name: path, headers: [], query: [], source: "openapi" as const, createdAt: new Date() } }, upsert: true },
  });
  assert.equal((await e.bulkWrite([op("/a"), op("/b")])).upsertedCount, 2);
  assert.equal((await e.bulkWrite([op("/a"), op("/c")])).upsertedCount, 1);
  await assert.rejects(
    e.insertOne({ serviceId, method: "GET", path: "/a", name: "dup", headers: [], query: [], source: "manual", createdAt: new Date() }),
    (err: { code?: number }) => err.code === 11000,
  );
});
