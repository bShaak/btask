import type { TaskNode } from "../api/service.ts";

export const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

const RESET = "\x1b[0m";
const REVERSE = "\x1b[7m";
const STRIKE = "\x1b[9m";

function rowText(title: string, status: string, frame: number): string {
  if (status === "finished") return `[x] ${STRIKE}${title}${RESET}`;
  if (status === "in_progress") return `${SPINNER[frame % SPINNER.length]} ${title}`;
  return `[ ] ${title}`;
}

function rows(nodes: TaskNode[], selectedId: string | null, frame: number, depth = 0): string[] {
  const lines: string[] = [];
  for (const n of nodes) {
    const line = `${"  ".repeat(depth)}${rowText(n.task.title, n.task.status, frame)}`;
    lines.push(n.task.id === selectedId ? `${REVERSE}${line}${RESET}` : line);
    lines.push(...rows(n.children, selectedId, frame, depth + 1));
  }
  return lines;
}

export function render(tree: TaskNode[], selectedId: string | null, frame: number): string {
  const lines = ["btask — today's goals", ""];
  const body = rows(tree, selectedId, frame);
  lines.push(...(body.length > 0 ? body : ["No tasks yet. Press a to add a goal."]));
  lines.push("", "j/k navigate · a add sub-task · space status · x complete · q quit");
  return lines.join("\n");
}
