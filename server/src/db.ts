import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { dataDir } from "./config.ts";

const MIGRATIONS_DIR = path.resolve(
  import.meta.dirname,
  "..",
  "migrations",
);

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath = path.join(dataDir(), "app.db");
  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  runMigrations(_db);
  return _db;
}

function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);
  const applied = new Set(
    (db
      .prepare("SELECT name FROM _migrations")
      .all() as { name: string }[]).map((r) => r.name),
  );
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  const insert = db.prepare(
    "INSERT INTO _migrations (name, applied_at) VALUES (?, ?)",
  );
  for (const f of files) {
    if (applied.has(f)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
    db.exec("BEGIN");
    try {
      db.exec(sql);
      insert.run(f, Date.now());
      db.exec("COMMIT");
      console.log(`Applied migration ${f}`);
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}
