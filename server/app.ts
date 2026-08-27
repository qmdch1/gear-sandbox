import express from "express";
import cors from "cors";
import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

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
