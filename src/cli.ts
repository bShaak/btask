import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createService, type Task, type TaskNode } from "./api/service.ts";

function dbPath(): string {
  return process.env["BTASK_DB"] ?? ".btask/btask.db";
}

function ensureService() {
  const path = dbPath();
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  return createService(path, { artifactDir: process.env["BTASK_ARTIFACTS"] ?? "artifacts" });
}

function hasFlag(args: string[], ...names: string[]): boolean {
  return args.some((a) => names.includes(a));
}

function flagValue(args: string[], ...names: string[]): string | undefined {
  for (let i = 0; i < args.length; i++) {
    if (names.includes(args[i] ?? "")) return args[i + 1];
    const arg = args[i] ?? "";
    for (const name of names) {
      if (arg.startsWith(name + "=")) return arg.slice(name.length + 1);
    }
  }
  return undefined;
}

function renderHuman(nodes: TaskNode[], depth = 0): string[] {
  const lines: string[] = [];
  for (const n of nodes) {
    const mark = n.task.status === "finished" ? "[x]" : n.task.status === "in_progress" ? "[~]" : "[ ]";
    lines.push(`${"  ".repeat(depth)}${mark} ${n.task.title} (${n.task.id.slice(0, 8)})`);
    lines.push(...renderHuman(n.children, depth + 1));
  }
  return lines;
}

function renderTaskHuman(task: Task): string {
  const mark = task.status === "finished" ? "[x]" : task.status === "in_progress" ? "[~]" : "[ ]";
  const notes = task.notes ? `\n  notes: ${task.notes}` : "";
  return `${mark} ${task.title} (${task.id.slice(0, 8)}) [${task.status}]${notes}`;
}

function renderContextHuman(tasks: Task[]): string[] {
  return tasks.map((t) => {
    const parent = t.parentId ? ` parent=${t.parentId.slice(0, 8)}` : "";
    return `${t.id.slice(0, 8)} [${t.status}] ${t.title}${parent}`;
  });
}

function usage(): string {
  return `btask list [--human]
btask get <id> [--human]
btask create <title> [--parent <id>] [--notes <text>] [--habit] [--human]
btask update <id> [--title <text>] [--notes <text>] [--human]
btask delete <id>
btask status <id> <todo|in_progress|finished> [--human]
btask complete <id> [--summary <text>] [--human]
btask habit <id> <on|off> [--human]
btask habits [--human]
btask context [--human]`;
}

export function run(argv: string[]): void {
  const [cmd, ...rest] = argv;
  const human = hasFlag(rest, "--human");
  const svc = ensureService();
  try {
    if (cmd === "list") {
      const tree = svc.list();
      if (human) console.log(renderHuman(tree).join("\n"));
      else console.log(JSON.stringify(tree, null, 2));
    } else if (cmd === "get") {
      const [id] = rest.filter((a) => !a.startsWith("-"));
      if (!id) throw new Error(usage());
      const task = svc.get(id);
      if (!task) throw new Error(`task not found: ${id}`);
      if (human) console.log(renderTaskHuman(task));
      else console.log(JSON.stringify(task, null, 2));
    } else if (cmd === "create") {
      const title = rest.find((a) => !a.startsWith("-"));
      if (!title) throw new Error(usage());
      const task = svc.create({
        title,
        parentId: flagValue(rest, "--parent"),
        notes: flagValue(rest, "--notes"),
        habit: hasFlag(rest, "--habit"),
      });
      if (human) console.log(`[ ] ${task.title} (${task.id.slice(0, 8)})`);
      else console.log(JSON.stringify(task, null, 2));
    } else if (cmd === "update") {
      const [id] = rest.filter((a) => !a.startsWith("-"));
      if (!id) throw new Error(usage());
      const task = svc.update(id, {
        title: flagValue(rest, "--title"),
        notes: flagValue(rest, "--notes"),
      });
      if (human) console.log(renderTaskHuman(task));
      else console.log(JSON.stringify(task, null, 2));
    } else if (cmd === "delete") {
      const [id] = rest.filter((a) => !a.startsWith("-"));
      if (!id) throw new Error(usage());
      svc.remove(id);
      if (human) console.log(`deleted ${id.slice(0, 8)}`);
      else console.log(JSON.stringify({ deleted: id }));
    } else if (cmd === "complete") {
      const [id] = rest.filter((a) => !a.startsWith("-"));
      if (!id) throw new Error(usage());
      const task = svc.complete(id, flagValue(rest, "--summary"));
      if (human) console.log(`[x] ${task.title} (${task.id.slice(0, 8)})`);
      else console.log(JSON.stringify(task, null, 2));
    } else if (cmd === "habit") {
      const positional = rest.filter((a) => !a.startsWith("-"));
      const [id, value] = positional;
      if (!id || (value !== "on" && value !== "off")) throw new Error(usage());
      const task = svc.setHabit(id, value === "on");
      if (human) console.log(renderTaskHuman(task));
      else console.log(JSON.stringify(task, null, 2));
    } else if (cmd === "habits") {
      const tasks = svc.habits();
      if (human) console.log(renderContextHuman(tasks).join("\n"));
      else console.log(JSON.stringify(tasks, null, 2));
    } else if (cmd === "context") {
      const tasks = svc.context();
      if (human) console.log(renderContextHuman(tasks).join("\n"));
      else console.log(JSON.stringify(tasks, null, 2));
    } else if (cmd === "status") {
      const positional = rest.filter((a) => !a.startsWith("-"));
      const [id, status] = positional;
      if (!id || !status) throw new Error(usage());
      const task = svc.setStatus(id, status as "todo" | "in_progress" | "finished");
      if (human) console.log(`${task.status} ${task.title} (${task.id.slice(0, 8)})`);
      else console.log(JSON.stringify(task, null, 2));
    } else {
      throw new Error(usage());
    }
  } finally {
    svc.close();
  }
}

if (import.meta.main) {
  try {
    run(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
