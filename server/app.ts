import express from "express";
import cors from "cors";
import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

/** Same shape check `src/persistence/serialize.ts`'s `isValidRemoteLink` does on the
 *  client -- kept as a small self-contained copy here rather than a cross-import
 *  (`server/` and `src/` are separate build/type-check contexts in this project; see
 *  tsconfig.json's `include`). The client already refuses to save a malformed
 *  `RemoteLink`, but the server had no check of its own -- a save request that skipped
 *  the client's validator (a hand-crafted request, a future/other client) could still
 *  reach the database, where it would sit until some future GET's `deserializeLayout`
 *  rejected the whole layout as unloadable. Reject it here instead, at write time. */
function isValidRemoteLinksArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every(
      (link) =>
        typeof link === "object" &&
        link !== null &&
        typeof (link as Record<string, unknown>).a === "string" &&
        typeof (link as Record<string, unknown>).b === "string" &&
        ((link as Record<string, unknown>).kind === "chain" || (link as Record<string, unknown>).kind === "belt"),
    )
  );
}

const GEAR_TYPES = new Set([
  "spur", "helical", "crank", "bevel", "worm", "load",
  "rack", "planetary", "ratchet", "sprocket", "pulley", "differential",
]);

function isFiniteNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function isVec3(value: unknown): boolean {
  return Array.isArray(value) && value.length === 3 && value.every(isFiniteNumber);
}

/** Same shape check `src/persistence/serialize.ts`'s `isValidGear` does on the client --
 *  kept as a small self-contained copy here rather than a cross-import, for the same
 *  reason `isValidRemoteLinksArray` above is: `server/` and `src/` are separate
 *  build/type-check contexts (see tsconfig.json's `include`). Only `gears`' own POST/PUT
 *  route previously fell back to a shallow `Array.isArray(gears)` check -- a malformed
 *  element (missing field, wrong type, an object where a tuple was expected, an unknown
 *  `type` string) would be accepted here and only fail much later, deep inside client
 *  code that assumes well-formed `GearInstance` objects. Reject it here instead, at write
 *  time. Deliberately does NOT check cross-field invariants like `durabilityCurrent <=
 *  durabilityMax` -- the client's `isValidGear` doesn't either; this is a shape/type
 *  validator, not a business-rule validator, and the two should keep agreeing. */
function isValidGearsArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.every((gear) => {
      if (typeof gear !== "object" || gear === null) return false;
      const g = gear as Record<string, unknown>;
      return (
        typeof g.id === "string" &&
        g.id.length > 0 &&
        typeof g.type === "string" &&
        GEAR_TYPES.has(g.type) &&
        isVec3(g.position) &&
        isVec3(g.axis) &&
        isFiniteNumber(g.teeth) &&
        isFiniteNumber(g.module) &&
        isFiniteNumber(g.durabilityMax) &&
        isFiniteNumber(g.durabilityCurrent) &&
        typeof g.broken === "boolean" &&
        isFiniteNumber(g.rotation) &&
        isFiniteNumber(g.angularVelocity) &&
        (g.linearPosition === undefined || isFiniteNumber(g.linearPosition))
      );
    })
  );
}

export function createApp(db: Database.Database): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "5mb" }));

  app.post("/api/layouts", (req, res) => {
    const { name, gears, remoteLinks } = req.body ?? {};
    if (typeof name !== "string" || !name.trim() || !Array.isArray(gears)) {
      res.status(400).json({ error: "name (string) and gears (array) are required" });
      return;
    }
    if (!isValidGearsArray(gears)) {
      res.status(400).json({
        error:
          "gears must be an array of well-formed GearInstance objects (id, type, position, axis, teeth, module, durabilityMax, durabilityCurrent, broken, rotation, angularVelocity)",
      });
      return;
    }
    if (remoteLinks !== undefined && !isValidRemoteLinksArray(remoteLinks)) {
      res.status(400).json({ error: "remoteLinks, if present, must be an array of {a, b, kind: 'chain'|'belt'}" });
      return;
    }
    const id = randomUUID();
    const now = new Date().toISOString();
    db.prepare(
      "INSERT INTO layouts (id, name, user_id, gears_json, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?)",
    ).run(id, name, JSON.stringify({ gears, remoteLinks: remoteLinks ?? [] }), now, now);
    res.status(201).json({ id, name, updatedAt: now });
  });

  app.get("/api/layouts", (_req, res) => {
    const rows = db.prepare("SELECT id, name, updated_at as updatedAt FROM layouts ORDER BY updated_at DESC").all();
    res.json(rows);
  });

  app.get("/api/layouts/:id", (req, res) => {
    const row = db
      .prepare("SELECT id, name, gears_json as gearsJson, updated_at as updatedAt FROM layouts WHERE id = ?")
      .get(req.params.id) as { id: string; name: string; gearsJson: string; updatedAt: string } | undefined;
    if (!row) {
      res.status(404).json({ error: "layout not found" });
      return;
    }
    const stored = JSON.parse(row.gearsJson);
    // `stored` is either a v1 plain gears array (pre-remoteLinks) or a v2 { gears, remoteLinks } object.
    const gears = Array.isArray(stored) ? stored : stored.gears;
    const remoteLinks = Array.isArray(stored) ? [] : (stored.remoteLinks ?? []);
    res.json({ id: row.id, name: row.name, gears, remoteLinks, updatedAt: row.updatedAt });
  });

  app.put("/api/layouts/:id", (req, res) => {
    const existing = db.prepare("SELECT id FROM layouts WHERE id = ?").get(req.params.id);
    if (!existing) {
      res.status(404).json({ error: "layout not found" });
      return;
    }
    const { name, gears, remoteLinks } = req.body ?? {};
    if (!Array.isArray(gears)) {
      res.status(400).json({ error: "gears (array) is required" });
      return;
    }
    if (!isValidGearsArray(gears)) {
      res.status(400).json({
        error:
          "gears must be an array of well-formed GearInstance objects (id, type, position, axis, teeth, module, durabilityMax, durabilityCurrent, broken, rotation, angularVelocity)",
      });
      return;
    }
    if (remoteLinks !== undefined && !isValidRemoteLinksArray(remoteLinks)) {
      res.status(400).json({ error: "remoteLinks, if present, must be an array of {a, b, kind: 'chain'|'belt'}" });
      return;
    }
    const now = new Date().toISOString();
    const payload = JSON.stringify({ gears, remoteLinks: remoteLinks ?? [] });
    if (typeof name === "string" && name.trim()) {
      db.prepare("UPDATE layouts SET name = ?, gears_json = ?, updated_at = ? WHERE id = ?").run(name, payload, now, req.params.id);
    } else {
      db.prepare("UPDATE layouts SET gears_json = ?, updated_at = ? WHERE id = ?").run(payload, now, req.params.id);
    }
    const row = db.prepare("SELECT name FROM layouts WHERE id = ?").get(req.params.id) as { name: string };
    res.json({ id: req.params.id, name: row.name, updatedAt: now });
  });

  return app;
}
