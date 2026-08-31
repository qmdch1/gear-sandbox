import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../../server/db";
import type Database from "better-sqlite3";

/** Every test in here opens a `openDb` against a real file inside its own temp dir --
 *  unlike every other test in this repo (`openDb(":memory:")`), this exercises the
 *  actual on-disk path a production server restart hits: `mkdirSync` of a not-yet-existing
 *  directory tree, WAL-mode persistence, and `CREATE TABLE IF NOT EXISTS` idempotency
 *  across multiple opens of the same file. */
describe("openDb (real file path)", () => {
  let tmpDir: string;
  let db: Database.Database | undefined;

  afterEach(() => {
    db?.close();
    db = undefined;
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("creates a non-existent nested directory tree and the db file", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "gear-sandbox-db-test-"));
    const dbPath = join(tmpDir, "nested", "subdir", "layouts.db");

    expect(existsSync(join(tmpDir, "nested"))).toBe(false);

    db = openDb(dbPath);

    expect(existsSync(join(tmpDir, "nested", "subdir"))).toBe(true);
    expect(existsSync(dbPath)).toBe(true);
  });

  it("persists rows across a close + fresh openDb of the same file (server-restart scenario)", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "gear-sandbox-db-test-"));
    const dbPath = join(tmpDir, "layouts.db");

    const first = openDb(dbPath);
    first
      .prepare(
        "INSERT INTO layouts (id, name, user_id, gears_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run("layout-1", "persisted", null, JSON.stringify({ gears: [], remoteLinks: [] }), "2020-01-01", "2020-01-01");
    first.close();

    // Fresh connection to the same file -- simulates the server process restarting.
    // If `CREATE TABLE IF NOT EXISTS` didn't correctly no-op here, this would either
    // throw or silently wipe the row inserted above.
    db = openDb(dbPath);
    const row = db.prepare("SELECT * FROM layouts WHERE id = ?").get("layout-1") as
      | Record<string, unknown>
      | undefined;

    expect(row).toBeTruthy();
    expect(row?.name).toBe("persisted");
    expect(row?.gears_json).toBe(JSON.stringify({ gears: [], remoteLinks: [] }));
  });

  it("applies WAL journal mode", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "gear-sandbox-db-test-"));
    const dbPath = join(tmpDir, "layouts.db");

    db = openDb(dbPath);

    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
  });
});
