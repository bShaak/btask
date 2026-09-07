import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Task } from "./tasks.ts";

export type ArtifactInput = {
  dir: string;
  goal: Task;
  subtasks: Task[];
  summary?: string;
  now: number;
};

export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || "task";
}

export function writeArtifact(input: ArtifactInput): string {
  const day = new Date(input.now).toISOString().slice(0, 10);
  const name = `${day}-${slugify(input.goal.title)}-${input.goal.id}.md`;
  const lines = [
    "---",
    `goal: ${input.goal.id}`,
    `title: ${input.goal.title}`,
    `completedAt: ${new Date(input.now).toISOString()}`,
    `subtasks: ${input.subtasks.length}`,
    "---",
    `# ${input.goal.title}`,
    "",
  ];
  if (input.summary) {
    lines.push("## Summary", "", input.summary, "");
  }
  lines.push("## Sub-tasks", "");
  for (const sub of input.subtasks) {
    const mark = sub.status === "finished" ? "x" : " ";
    lines.push(`- [${mark}] ${sub.title} (${sub.status})`);
  }
  lines.push("");
  mkdirSync(input.dir, { recursive: true });
  const path = join(input.dir, name);
  writeFileSync(path, lines.join("\n"));
  return path;
}
