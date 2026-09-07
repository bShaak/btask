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
});
