import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

// No user accounts, so there's no reason for more than one saved layout -- a single
// fixed-id row that "저장" always overwrites and "불러오기" always reads back, rather
// than a list of named layouts nobody but a single local user would ever pick between.
export const SINGLETON_LAYOUT_ID = 1;

export function openDb(path: string): Database.Database {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS layout (
      id INTEGER PRIMARY KEY CHECK (id = ${SINGLETON_LAYOUT_ID}),
      gears_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  return db;
}
