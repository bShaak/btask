import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createService } from "./service.ts";

describe("task service", () => {
  test("creates goals with sub-tasks indented in creation order", () => {
    const svc = createService(":memory:");
    const goalA = svc.create({ title: "Ship btask" });
    const goalB = svc.create({ title: "Exercise" });
    const sub = svc.create({ title: "Write store", parentId: goalA.id });
    const tree = svc.list();
    expect(tree.map((n) => n.task.id)).toEqual([goalA.id, goalB.id]);
    expect(tree[0]?.children.map((c) => c.task.id)).toEqual([sub.id]);
    expect(tree[0]?.children[0]?.task.parentId).toBe(goalA.id);
  });

  test("moves status through todo to in_progress to finished", () => {
    const svc = createService(":memory:");
    const goal = svc.create({ title: "Read" });
    expect(goal.status).toBe("todo");
    expect(svc.setStatus(goal.id, "in_progress").status).toBe("in_progress");
    expect(svc.setStatus(goal.id, "finished").status).toBe("finished");
  });

  test("rejects sub-task under missing parent", () => {
    const svc = createService(":memory:");
    expect(() => svc.create({ title: "Orphan", parentId: "nope" })).toThrow();
  });

  test("updates title and notes", () => {
    const svc = createService(":memory:");
    const goal = svc.create({ title: "Read" });
    const updated = svc.update(goal.id, { title: "Read deeply", notes: "Ch 3" });
    expect(updated.title).toBe("Read deeply");
    expect(updated.notes).toBe("Ch 3");
    expect(svc.get(goal.id)?.title).toBe("Read deeply");
  });

  test("rejects empty title on update and missing task", () => {
    const svc = createService(":memory:");
    const goal = svc.create({ title: "Read" });
    expect(() => svc.update(goal.id, { title: "  " })).toThrow();
    expect(() => svc.update("nope", { title: "X" })).toThrow();
    expect(() => svc.remove("nope")).toThrow();
  });

  test("deletes a goal with its sub-tasks", () => {
    const svc = createService(":memory:");
    const goal = svc.create({ title: "Ship" });
    const sub = svc.create({ title: "Store", parentId: goal.id });
    svc.remove(goal.id);
    expect(svc.get(goal.id)).toBeNull();
    expect(svc.get(sub.id)).toBeNull();
    expect(svc.list()).toEqual([]);
  });

  test("context dumps every task with parent links", () => {
    const svc = createService(":memory:");
    const goal = svc.create({ title: "Ship" });
    const sub = svc.create({ title: "Store", parentId: goal.id });
    const ctx = svc.context();
    expect(ctx.map((t) => t.id).sort()).toEqual([goal.id, sub.id].sort());
    expect(ctx.find((t) => t.id === sub.id)?.parentId).toBe(goal.id);
  });

  test("completes a goal with open sub-tasks, writes artifact, wipes subs", () => {
    const dir = mkdtempSync(join(tmpdir(), "btask-art-"));
    const svc = createService(":memory:", {
      artifactDir: dir,
      now: () => new Date("2026-09-07T12:00:00Z").getTime(),
    });
    const goal = svc.create({ title: "Ship btask" });
    const done = svc.create({ title: "Write store", parentId: goal.id });
    const open = svc.create({ title: "Write CLI", parentId: goal.id });
    svc.setStatus(done.id, "finished");
    const completed = svc.complete(goal.id, "Shipped v1");
    expect(completed.status).toBe("finished");
    const tree = svc.list();
    expect(tree.map((n) => n.task.id)).toEqual([goal.id]);
    expect(tree[0]?.children).toEqual([]);
    const files = readdirSync(dir);
    expect(files.length).toBe(1);
    expect(files[0]).toMatch(/^2026-09-07-ship-btask-[0-9a-f-]+\.md$/);
    const body = readFileSync(join(dir, files[0] as string), "utf8");
    expect(body).toContain(`goal: ${goal.id}`);
    expect(body).toContain("Ship btask");
    expect(body).toContain("Write store");
    expect(body).toContain("Write CLI");
    expect(body).toContain("Shipped v1");
    expect(svc.get(open.id)).toBeNull();
  });

  test("completes without a summary and throws on missing id", () => {
    const dir = mkdtempSync(join(tmpdir(), "btask-art-"));
    const svc = createService(":memory:", { artifactDir: dir });
    const goal = svc.create({ title: "Exercise" });
    svc.create({ title: "Stretch", parentId: goal.id });
    const completed = svc.complete(goal.id);
    expect(completed.status).toBe("finished");
    expect(readdirSync(dir).length).toBe(1);
    expect(() => svc.complete("nope")).toThrow();
  });

  test("lists only incomplete habit tasks", () => {
    const svc = createService(":memory:");
    const run = svc.create({ title: "Exercise", habit: true });
    svc.create({ title: "Ship btask" });
    const read = svc.create({ title: "Read", habit: true });
    svc.setStatus(read.id, "finished");
    const habits = svc.habits();
    expect(habits.map((t) => t.id)).toEqual([run.id]);
  });

  test("toggles the habit marker and throws on missing id", () => {
    const svc = createService(":memory:");
    const goal = svc.create({ title: "Stretch" });
    expect(svc.habits()).toEqual([]);
    expect(svc.setHabit(goal.id, true).habit).toBe(true);
    expect(svc.habits().map((t) => t.id)).toEqual([goal.id]);
    expect(svc.setHabit(goal.id, false).habit).toBe(false);
    expect(svc.habits()).toEqual([]);
    expect(() => svc.setHabit("nope", true)).toThrow();
  });

  test("pulls incomplete reminders from habitui", () => {
    const seen: string[] = [];
    const svc = createService(":memory:", {
      habitSummary: (date) => {
        seen.push(date);
        return JSON.stringify({
          date,
          habits: [
            { id: 1, name: "Exercise", goal: 1, due: true, complete: false, completion_count: 0 },
            { id: 2, name: "Read", goal: 2, due: true, complete: true, completion_count: 2 },
            { id: 3, name: "Someday", goal: 1, due: false, complete: false, completion_count: 0 },
          ],
        });
      },
    });
    const reminders = svc.habitReminders("2026-09-07");
    expect(seen).toEqual(["2026-09-07"]);
    expect(reminders).toEqual([
      {
        source: "habitui",
        id: "1",
        title: "Exercise",
        goal: 1,
        completionCount: 0,
        date: "2026-09-07",
      },
    ]);
  });

  test("propagates habitui runner failures", () => {
    const svc = createService(":memory:", {
      habitSummary: () => {
        throw new Error("habitui not found");
      },
    });
    expect(() => svc.habitReminders("2026-09-07")).toThrow("habitui");
  });

  test("defaults artifacts to the shared dir", () => {
    const home = mkdtempSync(join(tmpdir(), "btask-home-"));
    const saved = process.env["HOME"];
    process.env["HOME"] = home;
    try {
      const svc = createService(":memory:");
      const goal = svc.create({ title: "Ship" });
      svc.complete(goal.id);
      expect(readdirSync(join(home, ".btask", "artifacts")).length).toBe(1);
      svc.close();
    } finally {
      if (saved === undefined) delete process.env["HOME"];
      else process.env["HOME"] = saved;
    }
  });

  test("emits one change event per mutation", () => {
    const events: Array<{ action: string; id: string }> = [];
    const svc = createService(":memory:", { onEvent: (e) => events.push(e) });
    const goal = svc.create({ title: "Ship" });
    svc.setStatus(goal.id, "in_progress");
    svc.update(goal.id, { notes: "n" });
    svc.setHabit(goal.id, true);
    const sub = svc.create({ title: "Store", parentId: goal.id });
    svc.remove(sub.id);
    svc.complete(goal.id, "done");
    expect(events).toEqual([
      { action: "created", id: goal.id },
      { action: "status", id: goal.id },
      { action: "updated", id: goal.id },
      { action: "habit", id: goal.id },
      { action: "created", id: sub.id },
      { action: "removed", id: sub.id },
      { action: "completed", id: goal.id },
    ]);
  });

  test("emits no events on reads", () => {
    const events: unknown[] = [];
    const svc = createService(":memory:", { onEvent: (e) => events.push(e) });
    const goal = svc.create({ title: "Ship" });
    events.length = 0;
    svc.get(goal.id);
    svc.list();
    svc.context();
    svc.habits();
    expect(events).toEqual([]);
  });

  test("stores an explicit project and filters by it", () => {
    const svc = createService(":memory:");
    const a = svc.create({ title: "Ship", project: "btask" });
    svc.create({ title: "Exercise" });
    expect(svc.get(a.id)?.project).toBe("btask");
    expect(svc.list({ project: "btask" }).map((n) => n.task.id)).toEqual([a.id]);
    expect(svc.list().length).toBe(2);
  });

  test("sub-tasks inherit the parent project", () => {
    const svc = createService(":memory:");
    const goal = svc.create({ title: "Ship", project: "btask" });
    const sub = svc.create({ title: "Store", parentId: goal.id });
    expect(sub.project).toBe("btask");
    const explicit = svc.create({ title: "Other", parentId: goal.id, project: "other" });
    expect(explicit.project).toBe("other");
  });

  test("migrates databases created before the project column", async () => {
    const { Database } = await import("bun:sqlite");
    const dir = mkdtempSync(join(tmpdir(), "btask-legacy-"));
    const path = join(dir, "btask.db");
    const db = new Database(path, { create: true });
    db.run(
      `CREATE TABLE tasks (
        id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
        parentId TEXT, status TEXT NOT NULL DEFAULT 'todo',
        habit INTEGER NOT NULL DEFAULT 0, createdAt INTEGER NOT NULL
      )`
    );
    db.run(`INSERT INTO tasks (id, title, createdAt) VALUES ('legacy-1', 'Old goal', 0)`);
    db.close();
    const svc = createService(path);
    expect(svc.get("legacy-1")?.project).toBeNull();
    expect(svc.list({ project: "btask" })).toEqual([]);
    svc.close();
  });
});
