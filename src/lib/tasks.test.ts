import { describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openStore } from "./tasks.ts";

describe("task store concurrency pragmas", () => {
  test("opens file databases in WAL mode so readers survive concurrent writers", () => {
    const dir = mkdtempSync(join(tmpdir(), "btask-wal-"));
    const path = join(dir, "btask.db");
    const store = openStore(path);
    store.create({ id: crypto.randomUUID(), title: "Probe", createdAt: Date.now() });
    store.close();
    const check = new Database(path, { readonly: true });
    const mode = check.query(`PRAGMA journal_mode`).get() as { journal_mode: string };
    check.close();
    expect(mode.journal_mode).toBe("wal");
  });

  test("reader succeeds while another connection holds a write lock (TUI + CLI)", () => {
    const dir = mkdtempSync(join(tmpdir(), "btask-lock-"));
    const path = join(dir, "btask.db");
    const setup = openStore(path);
    setup.create({ id: crypto.randomUUID(), title: "Seed", createdAt: Date.now() });
    setup.close();
    const writer = new Database(path);
    writer.run("BEGIN IMMEDIATE");
    writer.run("UPDATE tasks SET title = ? WHERE title = ?", ["Seed2", "Seed"]);
    const reader = openStore(path);
    try {
      expect(reader.listAll().length).toBe(1);
    } finally {
      writer.run("ROLLBACK");
      reader.close();
      writer.close();
    }
  });
  test("concurrent reader and writer on one file do not hit database-is-locked", () => {
    const dir = mkdtempSync(join(tmpdir(), "btask-conc-"));
    const path = join(dir, "btask.db");
    const reader = openStore(path);
    const writer = openStore(path);
    const seed = writer.create({ id: crypto.randomUUID(), title: "Seed", createdAt: Date.now() });
    expect(() => {
      for (let i = 0; i < 50; i++) {
        writer.setStatus(seed.id, i % 2 === 0 ? "in_progress" : "todo");
        reader.listAll();
      }
    }).not.toThrow();
    reader.close();
    writer.close();
  });
});
