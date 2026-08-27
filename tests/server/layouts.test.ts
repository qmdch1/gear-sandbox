import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { openDb } from "../../server/db";
import { createApp } from "../../server/app";
import type express from "express";
import type Database from "better-sqlite3";

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
    const gears = [{ id: "a", type: "spur" }];
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
    const updated = await request(app)
      .put(`/api/layouts/${created.body.id}`)
      .send({ name: "v2", gears: [{ id: "a", type: "crank" }] });
    expect(updated.status).toBe(200);
    expect(updated.body.name).toBe("v2");
    const fetched = await request(app).get(`/api/layouts/${created.body.id}`);
    expect(fetched.body.gears).toEqual([{ id: "a", type: "crank" }]);
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
});
