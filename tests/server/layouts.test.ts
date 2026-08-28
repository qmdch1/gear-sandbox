import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { openDb } from "../../server/db";
import { createApp } from "../../server/app";
import type express from "express";
import type Database from "better-sqlite3";

/** A well-formed `GearInstance` (see `src/sim/types.ts`), for tests that need the deep
 *  `isValidGearsArray` check on the server to accept the payload -- unlike the bare
 *  `{ id, type }` shorthand this file used before that check existed. */
function makeGear(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: "a",
    type: "spur",
    position: [0, 0, 0],
    axis: [0, 1, 0],
    teeth: 12,
    module: 1,
    durabilityMax: 100,
    durabilityCurrent: 100,
    broken: false,
    rotation: 0,
    angularVelocity: 0,
    ...overrides,
  };
}

describe("layouts API", () => {
  let app: express.Express;
  let db: Database.Database;

  beforeEach(() => {
    db = openDb(":memory:");
    app = createApp(db);
  });

  it("creates a layout and returns its id", async () => {
    const res = await request(app).post("/api/layouts").send({ name: "test", gears: [] });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();
    expect(res.body.name).toBe("test");
  });

  it("rejects a layout without a name", async () => {
    const res = await request(app).post("/api/layouts").send({ gears: [] });
    expect(res.status).toBe(400);
  });

  it("lists saved layouts newest first", async () => {
    await request(app).post("/api/layouts").send({ name: "first", gears: [] });
    await request(app).post("/api/layouts").send({ name: "second", gears: [] });
    const res = await request(app).get("/api/layouts");
    expect(res.body.map((l: { name: string }) => l.name)).toEqual(["second", "first"]);
  });

  it("round-trips gears through save and fetch", async () => {
    const gears = [makeGear()];
    const created = await request(app).post("/api/layouts").send({ name: "roundtrip", gears });
    const fetched = await request(app).get(`/api/layouts/${created.body.id}`);
    expect(fetched.status).toBe(200);
    expect(fetched.body.gears).toEqual(gears);
  });

  it("404s when fetching a layout that doesn't exist", async () => {
    const res = await request(app).get("/api/layouts/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("overwrites an existing layout via PUT", async () => {
    const created = await request(app).post("/api/layouts").send({ name: "v1", gears: [] });
    const updatedGears = [makeGear({ type: "crank" })];
    const updated = await request(app)
      .put(`/api/layouts/${created.body.id}`)
      .send({ name: "v2", gears: updatedGears });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe("v2");
    const fetched = await request(app).get(`/api/layouts/${created.body.id}`);
    expect(fetched.body.gears).toEqual(updatedGears);
  });

  it("404s when updating a layout that doesn't exist", async () => {
    const res = await request(app).put("/api/layouts/does-not-exist").send({ gears: [] });
    expect(res.status).toBe(404);
  });

  it("round-trips remoteLinks through save and load, alongside gears", async () => {
    const created = await request(app)
      .post("/api/layouts")
      .send({ name: "with-links", gears: [], remoteLinks: [{ a: "x", b: "y", kind: "chain" }] })
      .expect(201);
    const fetched = await request(app).get(`/api/layouts/${created.body.id}`).expect(200);
    expect(fetched.body.remoteLinks).toEqual([{ a: "x", b: "y", kind: "chain" }]);
  });

  it("defaults remoteLinks to [] when loading a layout saved before this field existed", async () => {
    // Simulates a pre-v2 row: gears_json is a bare array, not {gears, remoteLinks}.
    db.prepare(
      "INSERT INTO layouts (id, name, user_id, gears_json, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?)",
    ).run("legacy-1", "legacy", JSON.stringify([]), "2020-01-01", "2020-01-01");
    const fetched = await request(app).get("/api/layouts/legacy-1").expect(200);
    expect(fetched.body.remoteLinks).toEqual([]);
  });

  it("rejects a POST whose remoteLinks entries are malformed", async () => {
    const res = await request(app)
      .post("/api/layouts")
      .send({ name: "bad-links", gears: [], remoteLinks: [{ a: "x" }] }); // missing b/kind
    expect(res.status).toBe(400);
  });

  it("rejects a POST whose remoteLinks is not an array at all", async () => {
    const res = await request(app).post("/api/layouts").send({ name: "bad-links", gears: [], remoteLinks: "nope" });
    expect(res.status).toBe(400);
  });

  it("rejects a PUT whose remoteLinks entries have an unknown kind", async () => {
    const created = await request(app).post("/api/layouts").send({ name: "v1", gears: [] }).expect(201);
    const res = await request(app)
      .put(`/api/layouts/${created.body.id}`)
      .send({ gears: [], remoteLinks: [{ a: "x", b: "y", kind: "rope" }] });
    expect(res.status).toBe(400);
  });

  it("still accepts a POST with no remoteLinks field at all (defaults to [])", async () => {
    const res = await request(app).post("/api/layouts").send({ name: "no-links", gears: [] });
    expect(res.status).toBe(201);
  });

  it("accepts a POST whose gears is a well-formed GearInstance array", async () => {
    const res = await request(app)
      .post("/api/layouts")
      .send({ name: "good-gears", gears: [makeGear(), makeGear({ id: "b", type: "load" })] });
    expect(res.status).toBe(201);
  });

  it("rejects a POST whose gears entries are missing a required field", async () => {
    const gear = makeGear() as Record<string, unknown>;
    delete gear.durabilityCurrent;
    const res = await request(app).post("/api/layouts").send({ name: "bad-gears", gears: [gear] });
    expect(res.status).toBe(400);
  });

  it("rejects a POST whose gears entries have the wrong type for a field", async () => {
    const res = await request(app)
      .post("/api/layouts")
      .send({ name: "bad-gears", gears: [makeGear({ teeth: "12" })] });
    expect(res.status).toBe(400);
  });

  it("rejects a POST whose gears entries have an unknown type string", async () => {
    const res = await request(app)
      .post("/api/layouts")
      .send({ name: "bad-gears", gears: [makeGear({ type: "cog" })] });
    expect(res.status).toBe(400);
  });

  it("rejects a POST whose gears entries have a malformed position (wrong length)", async () => {
    const res = await request(app)
      .post("/api/layouts")
      .send({ name: "bad-gears", gears: [makeGear({ position: [0, 0] })] });
    expect(res.status).toBe(400);
  });

  it("rejects a POST whose gears entries have a malformed axis (non-number element)", async () => {
    const res = await request(app)
      .post("/api/layouts")
      .send({ name: "bad-gears", gears: [makeGear({ axis: [0, "1", 0] })] });
    expect(res.status).toBe(400);
  });

  it("rejects a PUT whose gears entries are malformed the same way", async () => {
    const created = await request(app).post("/api/layouts").send({ name: "v1", gears: [] }).expect(201);
    const res = await request(app)
      .put(`/api/layouts/${created.body.id}`)
      .send({ gears: [makeGear({ broken: "no" })] });
    expect(res.status).toBe(400);
  });
});
