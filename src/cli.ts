import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createService, type HabitReminder, type Task, type TaskNode } from "./api/service.ts";
import { defaultArtifactDir, defaultDbPath, detectProject, ensureDirFor, portFilePath, resolveUrl } from "./lib/discovery.ts";
import { habituiEventsUrl, subscribeHabitEvents } from "./lib/habit-events.ts";
import { asClient, createRemoteService, probeDaemon, type AsyncService } from "./server/remote.ts";
import { createServer } from "./server/server.ts";

const MUTATIONS = new Set(["create", "update", "delete", "status", "complete", "habit", "habits", "archive"]);

function dbPath(): string {
  return defaultDbPath();
}

function ensureService() {
  const path = dbPath();
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  return createService(path, { artifactDir: defaultArtifactDir() });
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

function resolveActor(args: string[]): string | undefined {
  return flagValue(args, "--actor") ?? process.env["BTASK_ACTOR"] ?? undefined;
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

function projectLabel(project: string | null): string {
  return project ?? "(no project)";
}

function sortProjectLabels(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b);
}

function renderTreeHuman(nodes: TaskNode[]): string[] {
  const groups = new Map<string | null, TaskNode[]>();
  for (const n of nodes) {
    const key = n.task.project ?? null;
    const group = groups.get(key);
    if (group) group.push(n);
    else groups.set(key, [n]);
  }
  const keys = [...groups.keys()].sort(sortProjectLabels);
  const lines: string[] = [];
  keys.forEach((key, index) => {
    if (index > 0) lines.push("");
    lines.push(`## ${projectLabel(key)}`);
    lines.push(...renderHuman(groups.get(key) ?? []));
  });
  return lines;
}

function renderTaskHuman(task: Task): string {
  const mark = task.status === "finished" ? "[x]" : task.status === "in_progress" ? "[~]" : "[ ]";
  const notes = task.notes ? `\n  notes: ${task.notes}` : "";
  const actor = task.actor ? ` @${task.actor}` : "";
  const archived = task.archived ? " [archived]" : "";
  return `${mark} ${task.title} (${task.id.slice(0, 8)}) [${task.status}]${actor}${archived}${notes}`;
}

function renderRemindersHuman(reminders: HabitReminder[]): string[] {
  return reminders.map((r) => `${r.title} (${r.completionCount}/${r.goal} today)`);
}

function renderContextLine(t: Task): string {
  const parent = t.parentId ? ` parent=${t.parentId.slice(0, 8)}` : "";
  return `${t.id.slice(0, 8)} [${t.status}] ${t.title}${parent}`;
}

function renderContextHuman(tasks: Task[]): string[] {
  const groups = new Map<string | null, Task[]>();
  for (const t of tasks) {
    const key = t.project ?? null;
    const group = groups.get(key);
    if (group) group.push(t);
    else groups.set(key, [t]);
  }
  const keys = [...groups.keys()].sort(sortProjectLabels);
  const lines: string[] = [];
  keys.forEach((key, index) => {
    if (index > 0) lines.push("");
    lines.push(`## ${projectLabel(key)}`);
    for (const t of groups.get(key) ?? []) lines.push(renderContextLine(t));
  });
  return lines;
}

function usage(): string {
  return `btask list [--human] [--project <name>] [--archived|--all]
btask get <id> [--human]
btask create <title> [--parent <id>] [--notes <text>] [--habit] [--project <name>] [--actor <name>] [--external-id <id>] [--human]
btask update <id> [--title <text>] [--notes <text>] [--actor <name>] [--human]
btask delete <id> [--actor <name>]
btask status <id> <todo|in_progress|finished> [--actor <name>] [--human]
btask complete <id> [--summary <text>] [--actor <name>] [--human]
btask habit <id> <on|off> [--actor <name>] [--human]
btask archive <id> [--off] [--actor <name>] [--human]
btask habits [--human] [--local] [--date YYYY-MM-DD]
btask habits push --external-id <id> --title <text> --date YYYY-MM-DD --count <n> --goal <n> [--actor <name>]
btask habits sync [--date YYYY-MM-DD] [--actor <name>]
btask habits watch [--actor <name>] [--human]
btask serve [--port <n>]
btask context [--human]`;
}

export async function run(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  const human = hasFlag(rest, "--human");
  const svc = ensureService();
  let leaveOpen = false;
  let remote: AsyncService | null = null;
  try {
    const client: AsyncService =
      cmd !== undefined && MUTATIONS.has(cmd) && (await probeDaemon(resolveUrl()))
        ? (remote = createRemoteService(resolveUrl()))
        : asClient(svc);
    if (cmd === "list") {
      const project = flagValue(rest, "--project");
      const archived = hasFlag(rest, "--all") ? "all" : hasFlag(rest, "--archived") ? "archived" : undefined;
      const tree = svc.list({ ...(project === undefined ? {} : { project }), ...(archived === undefined ? {} : { archived }) });
      if (human) console.log(renderTreeHuman(tree).join("\n"));
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
      const parentId = flagValue(rest, "--parent");
      const task = await client.create({
        title,
        parentId,
        notes: flagValue(rest, "--notes"),
        habit: hasFlag(rest, "--habit"),
        project: flagValue(rest, "--project") ?? (parentId ? undefined : detectProject()),
        actor: resolveActor(rest),
        externalId: flagValue(rest, "--external-id"),
      });
      if (human) console.log(`[ ] ${task.title} (${task.id.slice(0, 8)})`);
      else console.log(JSON.stringify(task, null, 2));
    } else if (cmd === "update") {
      const [id] = rest.filter((a) => !a.startsWith("-"));
      if (!id) throw new Error(usage());
      const task = await client.update(id, {
        title: flagValue(rest, "--title"),
        notes: flagValue(rest, "--notes"),
        actor: resolveActor(rest),
      });
      if (human) console.log(renderTaskHuman(task));
      else console.log(JSON.stringify(task, null, 2));
    } else if (cmd === "delete") {
      const [id] = rest.filter((a) => !a.startsWith("-"));
      if (!id) throw new Error(usage());
      await client.remove(id, resolveActor(rest));
      if (human) console.log(`deleted ${id.slice(0, 8)}`);
      else console.log(JSON.stringify({ deleted: id }));
    } else if (cmd === "complete") {
      const [id] = rest.filter((a) => !a.startsWith("-"));
      if (!id) throw new Error(usage());
      const task = await client.complete(
        id,
        flagValue(rest, "--summary"),
        resolveActor(rest)
      );
      if (human) console.log(`[x] ${task.title} (${task.id.slice(0, 8)})`);
      else console.log(JSON.stringify(task, null, 2));
    } else if (cmd === "habit") {
      const positional = rest.filter((a) => !a.startsWith("-"));
      const [id, value] = positional;
      if (!id || (value !== "on" && value !== "off")) throw new Error(usage());
      const task = await client.setHabit(
        id,
        value === "on",
        resolveActor(rest)
      );
      if (human) console.log(renderTaskHuman(task));
      else console.log(JSON.stringify(task, null, 2));
    } else if (cmd === "archive") {
      const [id] = rest.filter((a) => !a.startsWith("-"));
      if (!id) throw new Error(usage());
      const task = await client.setArchived(id, !hasFlag(rest, "--off"), resolveActor(rest));
      if (human) console.log(renderTaskHuman(task));
      else console.log(JSON.stringify(task, null, 2));
    } else if (cmd === "habits") {
      if (rest[0] === "watch") {
        const actor = flagValue(rest, "--actor") ?? process.env["BTASK_ACTOR"] ?? "habitui";
        await client.syncHabits(undefined, actor);
        if (human) console.log(`watching ${habituiEventsUrl()}`);
        const stop = subscribeHabitEvents(
          (event) => {
            client
              .syncHabits(event.date, actor)
              .then((result) => {
                if (human) console.log(`${result.goal.title}: ${result.created} created, ${result.updated} updated`);
                else console.log(JSON.stringify({ event, result }));
              })
              .catch((err) => console.error(err instanceof Error ? err.message : String(err)));
          },
          { onError: (err) => console.error(err) }
        );
        const shutdown = (): void => {
          stop();
          process.exit(0);
        };
        process.on("SIGINT", shutdown);
        process.on("SIGTERM", shutdown);
        leaveOpen = true;
        return;
      } else if (rest[0] === "sync") {
        const result = await client.syncHabits(
          flagValue(rest, "--date"),
          resolveActor(rest)
        );
        if (human) {
          console.log(
            `${result.goal.title}: ${result.created} created, ${result.updated} updated, ${result.archived.length} archived`
          );
        } else console.log(JSON.stringify(result, null, 2));
      } else if (rest[0] === "push") {
        const count = Number(flagValue(rest, "--count"));
        const goal = Number(flagValue(rest, "--goal"));
        const externalId = flagValue(rest, "--external-id") ?? "";
        const title = flagValue(rest, "--title") ?? "";
        const date = flagValue(rest, "--date") ?? "";
        if (!externalId || !title || !date || !Number.isInteger(count) || !Number.isInteger(goal)) {
          throw new Error(usage());
        }
        const task = await client.recordHabitCompletion({
          externalId,
          title,
          date,
          completionCount: count,
          goal,
          actor: resolveActor(rest),
        });
        if (human) console.log(renderTaskHuman(task));
        else console.log(JSON.stringify(task, null, 2));
      } else if (hasFlag(rest, "--local")) {
        const tasks = svc.habits();
        if (human) console.log(renderContextHuman(tasks).join("\n"));
        else console.log(JSON.stringify(tasks, null, 2));
      } else {
        const reminders = svc.habitReminders(flagValue(rest, "--date"));
        if (human) console.log(renderRemindersHuman(reminders).join("\n"));
        else console.log(JSON.stringify(reminders, null, 2));
      }
    } else if (cmd === "serve") {
      const port = Number(flagValue(rest, "--port") ?? process.env["BTASK_PORT"] ?? 3000);
      if (!Number.isInteger(port) || port < 0) throw new Error(usage());
      const file = portFilePath();
      const srv = createServer(svc, { port, portFile: file });
      const stopHabits = subscribeHabitEvents(
        (event) => {
          try {
            svc.syncHabits(event.date, "habitui");
          } catch (err) {
            console.error(`habit sync failed for ${event.date}: ${err instanceof Error ? err.message : String(err)}`);
          }
        },
        { onError: (err) => console.error(err) }
      );
      const shutdown = (): void => {
        stopHabits();
        srv.stop();
        process.exit(0);
      };
      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
      console.log(`listening on ${srv.url}`);
      leaveOpen = true;
      return;
    } else if (cmd === "context") {
      const tasks = svc.context();
      if (human) console.log(renderContextHuman(tasks).join("\n"));
      else console.log(JSON.stringify(tasks, null, 2));
    } else if (cmd === "status") {
      const positional = rest.filter((a) => !a.startsWith("-"));
      const [id, status] = positional;
      if (!id || !status) throw new Error(usage());
      const task = await client.setStatus(
        id,
        status as "todo" | "in_progress" | "finished",
        resolveActor(rest)
      );
      if (human) console.log(`${task.status} ${task.title} (${task.id.slice(0, 8)})`);
      else console.log(JSON.stringify(task, null, 2));
    } else {
      throw new Error(usage());
    }
  } finally {
    if (remote) await remote.close();
    else if (!leaveOpen) svc.close();
  }
}

if (import.meta.main) {
  try {
    await run(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
