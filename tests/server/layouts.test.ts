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

  it("deletes an existing layout, which is then gone from a subsequent GET", async () => {
    const created = await request(app).post("/api/layouts").send({ name: "to-delete", gears: [] }).expect(201);
    const res = await request(app).delete(`/api/layouts/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    const fetched = await request(app).get(`/api/layouts/${created.body.id}`);
    expect(fetched.status).toBe(404);
  });

  it("removes the layout from the list after deletion", async () => {
    const created = await request(app).post("/api/layouts").send({ name: "to-delete", gears: [] }).expect(201);
    await request(app).delete(`/api/layouts/${created.body.id}`).expect(200);
    const listed = await request(app).get("/api/layouts");
    expect(listed.body.map((l: { id: string }) => l.id)).not.toContain(created.body.id);
  });

  it("404s when deleting a layout that doesn't exist", async () => {
    const res = await request(app).delete("/api/layouts/does-not-exist");
    expect(res.status).toBe(404);
  });

  describe("centralized error handling", () => {
    // supertest's `.send()` normally JSON.stringifies an object payload for us -- which
    // makes it impossible to ever send genuinely invalid JSON syntax that way. To send a
    // deliberately malformed JSON *string* on the wire, set the Content-Type first and
    // `.send()` a raw string: superagent (supertest's HTTP client) only serializes
    // non-string data, so a string body with an `application/json` Content-Type is sent
    // through byte-for-byte, untouched (see node_modules/superagent/lib/node/index.js's
    // `_end`: `if (typeof data !== 'string') { ...serialize... }`).
    it("responds with a clean 400 JSON error for a malformed JSON body, not an HTML page", async () => {
      const res = await request(app)
        .post("/api/layouts")
        .set("Content-Type", "application/json")
        .send('{"name": "x", "gears": [}'); // invalid JSON syntax -- unbalanced/garbage token

      expect(res.status).toBe(400);
      expect(res.type).toBe("application/json");
      expect(res.body).toEqual({ error: "malformed JSON body" });
    });

    it("responds with a clean 413 JSON error for a body over the size limit", async () => {
      const res = await request(app)
        .post("/api/layouts")
        .set("Content-Type", "application/json")
        .send(JSON.stringify({ name: "x", gears: [], padding: "y".repeat(6 * 1024 * 1024) })); // > 5mb limit

      expect(res.status).toBe(413);
      expect(res.type).toBe("application/json");
      expect(res.body).toEqual({ error: "request body too large" });
    });

    it("still lets a route handler's own validation 400s through unchanged (no regression)", async () => {
      const res = await request(app).post("/api/layouts").send({ gears: [] }); // missing name
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: "name (string) and gears (array) are required" });
    });

    it("still accepts a well-formed request unchanged (no regression)", async () => {
      const res = await request(app).post("/api/layouts").send({ name: "test", gears: [] });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe("test");
    });
  });

  describe("vehicles survive the server, because a machine that cannot move is not the one you saved", () => {
    const CAR = { id: "car", wheel: "wheel", radius: 8, mass: 2, direction: [0, 0, 1], distance: 39.27 };
    const wheel = () => makeGear({ id: "wheel", ridesOn: "car" });

    it("stores a vehicle and returns it, down to the exact distance travelled", async () => {
      // Until this was fixed the POST handler destructured only { name, gears, remoteLinks }, so
      // the vehicle was dropped on the floor of the request and GET had none to return. The gears'
      // own `ridesOn` fields DID survive, so a saved car came back as a set of gears all claiming
      // to ride a vehicle that no longer existed -- and no error anywhere.
      const created = await request(app)
        .post("/api/layouts")
        .send({ name: "car", gears: [wheel()], vehicles: [CAR] });
      expect(created.status).toBe(201);

      const back = await request(app).get(`/api/layouts/${created.body.id}`);
      expect(back.status).toBe(200);
      expect(back.body.vehicles).toEqual([CAR]);
      expect(back.body.vehicles[0].distance).toBe(39.27); // not rounded, not reset to 0
      expect(back.body.gears[0].ridesOn).toBe("car");
    });

    it("carries a vehicle through an overwrite too", async () => {
      const created = await request(app).post("/api/layouts").send({ name: "car", gears: [wheel()], vehicles: [CAR] });
      const moved = { ...CAR, distance: 120.5 };
      const put = await request(app)
        .put(`/api/layouts/${created.body.id}`)
        .send({ name: "car", gears: [wheel()], vehicles: [moved] });
      expect(put.status).toBe(200);

      const back = await request(app).get(`/api/layouts/${created.body.id}`);
      expect(back.body.vehicles).toEqual([moved]);
    });

    it("refuses a vehicle whose wheel names no gear in the layout", async () => {
      // Such a vehicle is silently immobile forever -- its wheel speed reads as 0 -- which looks
      // like a complete machine rather than an error. Reject it at write time, as the client's
      // own loader does, rather than storing a layout that can never work.
      const res = await request(app)
        .post("/api/layouts")
        .send({ name: "car", gears: [makeGear({ id: "not-the-wheel" })], vehicles: [CAR] });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/vehicles/);

      const list = await request(app).get("/api/layouts");
      expect(list.body).toHaveLength(0); // nothing was written
    });

    it("refuses a malformed vehicle, and a non-finite distance in particular", async () => {
      const bad = [
        { ...CAR, radius: "8" },
        { ...CAR, distance: null },
        { ...CAR, direction: [0, 1] },
        { ...CAR, id: "" },
        { ...CAR, limit: [0] },
      ];
      for (const vehicle of bad) {
        const res = await request(app).post("/api/layouts").send({ name: "x", gears: [wheel()], vehicles: [vehicle] });
        expect(res.status).toBe(400);
      }
    });

    it("still loads the rows written before vehicles existed, as layouts with no vehicles", async () => {
      // v1 rows are a bare gears array and v2 rows are { gears, remoteLinks }; neither has a
      // `vehicles` key. Reading one must give [] rather than undefined -- nothing was lost,
      // because nothing could have put a vehicle there.
      const now = new Date().toISOString();
      db.prepare("INSERT INTO layouts (id, name, user_id, gears_json, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?)")
        .run("v1", "old", JSON.stringify([wheel()]), now, now);
      db.prepare("INSERT INTO layouts (id, name, user_id, gears_json, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?)")
        .run("v2", "older", JSON.stringify({ gears: [wheel()], remoteLinks: [] }), now, now);

      for (const id of ["v1", "v2"]) {
        const back = await request(app).get(`/api/layouts/${id}`);
        expect(back.status).toBe(200);
        expect(back.body.vehicles).toEqual([]);
        expect(back.body.gears).toHaveLength(1);
      }
    });

    it("accepts a layout with no vehicles at all, as most machines have none", async () => {
      const created = await request(app).post("/api/layouts").send({ name: "windmill", gears: [makeGear()] });
      expect(created.status).toBe(201);
      const back = await request(app).get(`/api/layouts/${created.body.id}`);
      expect(back.body.vehicles).toEqual([]);
    });
  });
});
