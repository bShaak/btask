import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createService, type Service, type TaskNode } from "../api/service.ts";
import { render } from "./render.ts";

const NEXT: Record<string, "todo" | "in_progress" | "finished"> = {
  todo: "in_progress",
  in_progress: "finished",
  finished: "todo",
};

function flatten(tree: TaskNode[]): string[] {
  const ids: string[] = [];
  for (const n of tree) {
    ids.push(n.task.id);
    ids.push(...flatten(n.children));
  }
  return ids;
}

export function start(options: { service: Service; stdin?: typeof process.stdin; stdout?: typeof process.stdout }): void {
  const stdin = options.stdin ?? process.stdin;
  const stdout = options.stdout ?? process.stdout;
  if (!stdin.isTTY || !stdout.isTTY) {
    throw new Error("tui requires an interactive terminal");
  }
  const svc = options.service;
  let selected: string | null = null;
  let frame = 0;
  let message = "";
  let adding = false;
  let buffer = "";

  function ids(): string[] {
    return flatten(svc.list());
  }

  function draw(): void {
    const tree = svc.list();
    const visible = flatten(tree);
    if (!selected || !visible.includes(selected)) selected = visible[0] ?? null;
    stdout.write("\x1b[2J\x1b[H\x1b[?25l");
    stdout.write(render(tree, selected, frame));
    stdout.write("\n");
    if (adding) stdout.write(`\nnew: ${buffer}█`);
    else if (message) stdout.write(`\n${message}`);
  }

  function move(delta: number): void {
    const visible = ids();
    if (visible.length === 0) return;
    const index = visible.indexOf(selected as string);
    const next = index < 0 ? 0 : (index + delta + visible.length) % visible.length;
    selected = visible[next] as string;
  }

  function cycle(): void {
    if (!selected) return;
    const task = svc.get(selected);
    if (!task) return;
    svc.setStatus(selected, NEXT[task.status] as "todo" | "in_progress" | "finished");
    message = "";
  }

  function complete(): void {
    if (!selected) return;
    svc.complete(selected);
    message = "goal completed — summary artifact written";
  }

  function confirmAdd(): void {
    const title = buffer.trim();
    adding = false;
    buffer = "";
    if (!title) return;
    const visible = ids();
    if (visible.length === 0 || !selected) {
      const goal = svc.create({ title });
      selected = goal.id;
    } else {
      const sub = svc.create({ title, parentId: selected });
      selected = sub.id;
    }
    message = "";
  }

  stdin.setRawMode(true);
  stdin.resume();
  const timer = setInterval(() => {
    frame += 1;
    draw();
  }, 500);

  function stop(): void {
    clearInterval(timer);
    stdin.setRawMode(false);
    stdin.pause();
    stdout.write("\x1b[?25h");
    svc.close();
  }

  stdin.on("data", (chunk: Buffer) => {
    const key = chunk.toString("utf8");
    if (key === "\x03" || (!adding && key === "q")) {
      stop();
      process.exit(0);
    }
    if (adding) {
      if (key.startsWith("\x1b") && key.length > 1) return void draw();
      for (const char of key) {
        if (char === "\r") {
          confirmAdd();
          break;
        } else if (char === "\x1b") {
          adding = false;
          buffer = "";
          break;
        } else if (char === "\x7f") buffer = buffer.slice(0, -1);
        else if (char >= " ") buffer += char;
      }
    } else if (key === "j" || key === "\x1b[B") move(1);
    else if (key === "k" || key === "\x1b[A") move(-1);
    else if (key === " ") cycle();
    else if (key === "x") complete();
    else if (key === "a") {
      adding = true;
      buffer = "";
      message = "";
    } else return;
    draw();
  });

  draw();
}

if (import.meta.main) {
  const db = process.env["BTASK_DB"] ?? ".btask/btask.db";
  if (db !== ":memory:") mkdirSync(dirname(db), { recursive: true });
  const service = createService(db, { artifactDir: process.env["BTASK_ARTIFACTS"] ?? "artifacts" });
  try {
    start({ service });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
