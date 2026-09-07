import { describe, expect, test } from "bun:test";
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
});
