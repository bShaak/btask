import { describe, expect, test } from "bun:test";
import { SPINNER, render } from "./render.ts";
import type { TaskNode } from "../api/service.ts";

function node(id: string, title: string, status: "todo" | "in_progress" | "finished", children: TaskNode[] = []): TaskNode {
  return {
    task: {
      id,
      title,
      notes: "",
      parentId: null,
      status,
      habit: false,
      project: null,
      actor: null,
      createdAt: 0,
    },
    children,
  };
}

describe("tui render", () => {
  test("pins goals on top with sub-tasks indented", () => {
    const tree = [
      node("g1", "Ship", "todo", [node("s1", "Store", "todo")]),
      node("g2", "Exercise", "todo"),
    ];
    const out = render(tree, null, 0);
    const lines = out.split("\n");
    expect(lines.findIndex((l) => l.includes("Ship"))).toBeLessThan(
      lines.findIndex((l) => l.includes("Exercise"))
    );
    expect(lines.find((l) => l.includes("Store"))).toMatch(/^ {2}\S/);
  });

  test("advances the spinner frame for in-progress tasks", () => {
    const tree = [node("g1", "Ship", "in_progress")];
    expect(render(tree, null, 0)).toContain(SPINNER[0] as string);
    expect(render(tree, null, 3)).toContain(SPINNER[3] as string);
    expect(render(tree, null, 0)).not.toContain("[ ]");
  });

  test("strikes through finished tasks", () => {
    const out = render([node("g1", "Ship", "finished")], null, 0);
    expect(out).toContain("\x1b[9mShip\x1b[0m");
  });

  test("highlights the selected row", () => {
    const out = render([node("g1", "Ship", "todo")], "g1", 0);
    expect(out).toContain("\x1b[7m");
  });

  test("shows a hint when there are no tasks", () => {
    expect(render([], null, 0)).toContain("No tasks");
  });
});
