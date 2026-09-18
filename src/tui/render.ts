import type { TaskNode } from "../api/service.ts";

export const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

const RESET = "\x1b[0m";
const REVERSE = "\x1b[7m";
const STRIKE = "\x1b[9m";
const UNPROJECTED = "(no project)";

// Catppuccin Mocha accents (https://catppuccin.com/palette).
// Red/Maroon are excluded — they read as error states.
export const MOCHA_ACCENTS = [
  "#CBA6F7", // Mauve
  "#89B4FA", // Blue
  "#74C7EC", // Sapphire
  "#89DCEB", // Sky
  "#94E2D5", // Teal
  "#A6E3A1", // Green
  "#F9E2AF", // Yellow
  "#FAB387", // Peach
  "#F5C2E7", // Pink
  "#B4BEFE", // Lavender
  "#F5E0DC", // Rosewater
  "#F2CDCD", // Flamingo
] as const;

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
}

function hashProject(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return hash;
}

// Deterministic color per project, stable across runs. Honors NO_COLOR.
// Emits 24-bit truecolor; most modern terminals support it.
export function projectColor(project: string | null): string {
  if (process.env["NO_COLOR"] !== undefined) return "";
  const name = project ?? UNPROJECTED;
  const [r, g, b] = hexToRgb(MOCHA_ACCENTS[hashProject(name) % MOCHA_ACCENTS.length] as string);
  return `\x1b[38;2;${r};${g};${b}m`;
}

function paint(text: string, color: string): string {
  return color ? `${color}${text}${RESET}` : text;
}

function rowText(title: string, status: string, frame: number, color: string): string {
  if (status === "finished") return `[x] ${STRIKE}${color}${title}${RESET}`;
  if (status === "in_progress") return `${SPINNER[frame % SPINNER.length]} ${color}${title}${RESET}`;
  return `[ ] ${color}${title}${RESET}`;
}

function rows(nodes: TaskNode[], selectedId: string | null, frame: number, depth = 0): string[] {
  const lines: string[] = [];
  for (const n of nodes) {
    const line = `${"  ".repeat(depth)}${rowText(n.task.title, n.task.status, frame, projectColor(n.task.project))}`;
    lines.push(n.task.id === selectedId ? `${REVERSE}${line}${RESET}` : line);
    lines.push(...rows(n.children, selectedId, frame, depth + 1));
  }
  return lines;
}

function projectLabel(project: string | null): string {
  return project ?? UNPROJECTED;
}

function sortProjectLabels(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}

export function render(tree: TaskNode[], selectedId: string | null, frame: number): string {
  const lines = ["btask — today's goals", ""];
  if (tree.length === 0) {
    lines.push("No tasks yet. Press a to add a goal.");
  } else {
    const groups = new Map<string | null, TaskNode[]>();
    for (const n of tree) {
      const key = n.task.project ?? null;
      const group = groups.get(key);
      if (group) group.push(n);
      else groups.set(key, [n]);
    }
    [...groups.keys()].sort(sortProjectLabels).forEach((key, index) => {
      if (index > 0) lines.push("");
      lines.push(paint(`## ${projectLabel(key)}`, projectColor(key)));
      lines.push(...rows(groups.get(key) ?? [], selectedId, frame));
    });
  }
  lines.push("", "j/k navigate · a add · space status · x complete · A archive · D delete · q quit");
  return lines.join("\n");
}
