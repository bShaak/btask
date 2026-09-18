import { describe, expect, test } from "bun:test";
import { SPINNER, projectColor, render } from "./render.ts";
import type { TaskNode } from "../api/service.ts";

function node(id: string, title: string, status: "todo" | "in_progress" | "finished", children: TaskNode[] = [], project: string | null = null): TaskNode {
  return {
    task: {
      id,
      title,
      notes: "",
      parentId: null,
      status,
      habit: false,
      project,
      actor: null,
      externalId: null,
      archived: false,
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
    expect(out).toContain("\x1b[9m");
    expect(out).toContain("Ship");
  });

  test("highlights the selected row", () => {
    const out = render([node("g1", "Ship", "todo")], "g1", 0);
    expect(out).toContain("\x1b[7m");
  });

  test("shows a hint when there are no tasks", () => {
    expect(render([], null, 0)).toContain("No tasks");
  });

  test("groups goals under project headers, unprojected last", () => {
    const tree = [
      node("g1", "Ship", "todo", [], null),
      node("g2", "Stretch", "todo", [], "habitui"),
      node("g3", "Enforce", "todo", [], "btask"),
    ];
    const lines = render(tree, null, 0).split("\n");
    const plain = lines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""));
    const headers = plain.filter((l) => l.startsWith("## "));
    expect(headers).toEqual(["## btask", "## habitui", "## (no project)"]);
    expect(lines.findIndex((l) => l.includes("Enforce"))).toBeGreaterThan(
      lines.findIndex((l) => l === "## btask")
    );
  });

  test("keeps sub-tasks indented under their project group", () => {
    const tree = [node("g1", "Ship", "todo", [node("s1", "Store", "todo", [], "btask")], "btask")];
    const lines = render(tree, null, 0).split("\n");
    const plain = lines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""));
    expect(plain).toContain("## btask");
    expect(plain.find((l) => l.includes("Store"))).toMatch(/^ {2}\S/);
  });

  test("never highlights a project header as selected", () => {
    const tree = [node("g1", "Ship", "todo", [], "btask")];
    const lines = render(tree, "g1", 0).split("\n");
    expect(lines.filter((l) => l.startsWith("## ") || l.includes("## ")).every((l) => !l.includes("\x1b[7m"))).toBe(true);
    expect(lines.some((l) => l.includes("\x1b[7m") && l.includes("Ship"))).toBe(true);
  });

  test("paints headers and rows in the project color", () => {
    const tree = [node("g1", "Ship", "todo", [], "btask")];
    const out = render(tree, null, 0);
    expect(out).toContain(`${projectColor("btask")}## btask`);
    expect(out).toContain(`${projectColor("btask")}Ship`);
  });

  test("assigns stable, distinct colors per project", () => {
    expect(projectColor("btask")).toBe(projectColor("btask"));
    expect(projectColor("btask")).not.toBe(projectColor("habitui"));
    expect(projectColor(null)).toBe(projectColor("(no project)"));
  });

  test("keeps a mismatched child in its parent hierarchy with its own color", () => {
    const tree = [node("g1", "Ship", "todo", [node("s1", "Stray", "todo", [], "habitui")], "btask")];
    const lines = render(tree, null, 0).split("\n");
    const plain = lines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, ""));
    const shipIdx = plain.findIndex((l) => l.includes("Ship"));
    const strayIdx = plain.findIndex((l) => l.includes("Stray"));
    expect(strayIdx).toBeGreaterThan(shipIdx);
    expect(plain.find((l) => l.includes("Stray"))).toMatch(/^ {2}\S/);
    expect(lines.find((l) => l.includes("Stray"))).toContain(projectColor("habitui"));
  });

  test("honors NO_COLOR with plain headers", () => {
    const before = process.env["NO_COLOR"];
    process.env["NO_COLOR"] = "";
    try {
      const lines = render([node("g1", "Ship", "todo", [], "btask")], null, 0).split("\n");
      expect(lines).toContain("## btask");
      expect(lines.some((l) => l.includes("##") && l.includes("\x1b["))).toBe(false);
    } finally {
      if (before === undefined) delete process.env["NO_COLOR"];
      else process.env["NO_COLOR"] = before;
    }
  });
});
