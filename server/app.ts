import express from "express";
import cors from "cors";
import type Database from "better-sqlite3";
import { SINGLETON_LAYOUT_ID } from "./db";

/** No user accounts and one visitor at a time in practice, so the server holds exactly
 *  one saved layout rather than a named/listable set of them -- "저장" always
 *  overwrites it, "불러오기" always reads back whatever was last saved (everything,
 *  not a partial/most-recent-only slice). */
export function createApp(db: Database.Database): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "5mb" }));

  app.get("/api/layout", (_req, res) => {
    const row = db
      .prepare("SELECT gears_json as gearsJson FROM layout WHERE id = ?")
      .get(SINGLETON_LAYOUT_ID) as { gearsJson: string } | undefined;
    res.json({ gears: row ? JSON.parse(row.gearsJson) : [] });
  });

  app.put("/api/layout", (req, res) => {
    const { gears } = req.body ?? {};
    if (!Array.isArray(gears)) {
      res.status(400).json({ error: "gears (array) is required" });
      return;
    }
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO layout (id, gears_json, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET gears_json = excluded.gears_json, updated_at = excluded.updated_at`,
    ).run(SINGLETON_LAYOUT_ID, JSON.stringify(gears), now);
    res.json({ updatedAt: now });
  });

  return app;
}
