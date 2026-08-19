import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { openDb } from "../../server/db";
import { createApp } from "../../server/app";
import type express from "express";

describe("layout API (single saved layout, no user accounts)", () => {
  let app: express.Express;

  beforeEach(() => {
    app = createApp(openDb(":memory:"));
  });

  it("returns an empty layout before anything has been saved", async () => {
    const res = await request(app).get("/api/layout");
    expect(res.status).toBe(200);
    expect(res.body.gears).toEqual([]);
  });

  it("rejects a save without a gears array", async () => {
    const res = await request(app).put("/api/layout").send({});
    expect(res.status).toBe(400);
  });

  it("round-trips gears through save and fetch", async () => {
    const gears = [{ id: "a", type: "spur" }];
    const saved = await request(app).put("/api/layout").send({ gears });
    expect(saved.status).toBe(200);
    const fetched = await request(app).get("/api/layout");
    expect(fetched.body.gears).toEqual(gears);
  });

  it("overwrites the previously saved layout, not appends to it", async () => {
    await request(app).put("/api/layout").send({ gears: [{ id: "a", type: "spur" }] });
    await request(app).put("/api/layout").send({ gears: [{ id: "b", type: "crank" }] });
    const fetched = await request(app).get("/api/layout");
    expect(fetched.body.gears).toEqual([{ id: "b", type: "crank" }]);
  });
});
