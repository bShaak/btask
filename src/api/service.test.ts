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
});
