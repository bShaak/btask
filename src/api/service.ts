import { openStore, type Status, type Task } from "../lib/tasks.ts";
import { writeArtifact } from "../lib/artifacts.ts";
import {
  incompleteReminders,
  todayLocal,
  type HabitReminder,
  type SummaryRunner,
} from "../lib/habitui.ts";
import { defaultArtifactDir } from "../lib/discovery.ts";

export type { HabitReminder };
export type { Status, Task };
export type TaskNode = { task: Task; children: TaskNode[] };
export type CreateArgs = { title: string; notes?: string; parentId?: string; habit?: boolean; project?: string | null };
export type ListFilter = { project?: string };

export type UpdateArgs = { title?: string; notes?: string };

export type TaskEventAction = "created" | "updated" | "status" | "removed" | "completed" | "habit";
export type TaskEvent = { action: TaskEventAction; id: string };

export type ServiceOptions = {
  artifactDir?: string;
  now?: () => number;
  habitSummary?: SummaryRunner;
  onEvent?: (event: TaskEvent) => void;
};

export type Service = {
  create: (args: CreateArgs) => Task;
  get: (id: string) => Task | null;
  list: (filter?: ListFilter) => TaskNode[];
  setStatus: (id: string, status: Status) => Task;
  update: (id: string, patch: UpdateArgs) => Task;
  remove: (id: string) => void;
  complete: (id: string, summary?: string) => Task;
  setHabit: (id: string, habit: boolean) => Task;
  habits: () => Task[];
  habitReminders: (date?: string) => HabitReminder[];
  subscribe: (listener: (event: TaskEvent) => void) => () => void;
  context: () => Task[];
  close: () => void;
};

const VALID: ReadonlySet<string> = new Set(["todo", "in_progress", "finished"]);

export function createService(path: string, options: ServiceOptions = {}): Service {
  const store = openStore(path);
  const artifactDir = options.artifactDir ?? defaultArtifactDir();
  const now = options.now ?? Date.now;
  const listeners = new Set<(event: TaskEvent) => void>();
  if (options.onEvent) listeners.add(options.onEvent);
  const emit = (action: TaskEventAction, id: string): void => {
    const event = { action, id };
    for (const listener of listeners) listener(event);
  };
  function collectSubtree(rootId: string): string[] {
    const found: string[] = [];
    const queue = [rootId];
    while (queue.length > 0) {
      const current = queue.pop() as string;
      for (const t of store.listAll()) {
        if (t.parentId === current) {
          found.push(t.id);
          queue.push(t.id);
        }
      }
    }
    return found;
  }
  const created = (task: Task): Task => {
    emit("created", task.id);
    return task;
  };
  return {
    create(args) {
      const title = args.title.trim();
      if (!title) throw new Error("title is required");
      let parent: Task | null = null;
      if (args.parentId) {
        parent = store.get(args.parentId);
        if (!parent) throw new Error(`parent not found: ${args.parentId}`);
      }
      return created(
        store.create({
          id: crypto.randomUUID(),
          title,
          notes: args.notes ?? "",
          parentId: args.parentId,
          habit: args.habit,
          project: args.project === undefined ? (parent?.project ?? null) : args.project,
          createdAt: Date.now(),
        })
      );
    },
    get(id) {
      return store.get(id);
    },
    list(filter = {}) {
      const tasks =
        filter.project === undefined
          ? store.listAll()
          : store.listAll().filter((t) => t.project === filter.project);
      const byParent = new Map<string | null, Task[]>();
      for (const t of tasks) {
        const key = t.parentId ?? null;
        const group = byParent.get(key);
        if (group) group.push(t);
        else byParent.set(key, [t]);
      }
      const build = (parentId: string | null): TaskNode[] =>
        (byParent.get(parentId) ?? []).map((task) => ({
          task,
          children: build(task.id),
        }));
      return build(null);
    },
    setStatus(id, status) {
      if (!VALID.has(status)) throw new Error(`invalid status: ${status}`);
      const existing = store.get(id);
      if (!existing) throw new Error(`task not found: ${id}`);
      const next = store.setStatus(id, status) as Task;
      emit("status", id);
      return next;
    },
    update(id, patch) {
      const existing = store.get(id);
      if (!existing) throw new Error(`task not found: ${id}`);
      const title = patch.title === undefined ? existing.title : patch.title.trim();
      if (!title) throw new Error("title is required");
      const next = store.update(id, {
        title,
        notes: patch.notes === undefined ? existing.notes : patch.notes,
      }) as Task;
      emit("updated", id);
      return next;
    },
    remove(id) {
      const existing = store.get(id);
      if (!existing) throw new Error(`task not found: ${id}`);
      store.remove(id);
      for (const target of collectSubtree(id)) store.remove(target);
      emit("removed", id);
    },
    complete(id, summary) {
      const goal = store.get(id);
      if (!goal) throw new Error(`task not found: ${id}`);
      const subtree = collectSubtree(id);
      const subtasks = store.listAll().filter((t) => subtree.includes(t.id));
      const finished = store.setStatus(id, "finished") as Task;
      writeArtifact({ dir: artifactDir, goal: finished, subtasks, summary, now: now() });
      for (const target of subtree) store.remove(target);
      emit("completed", id);
      return finished;
    },
    context() {
      return store.listAll();
    },
    setHabit(id, habit) {
      const existing = store.get(id);
      if (!existing) throw new Error(`task not found: ${id}`);
      const next = store.setHabit(id, habit) as Task;
      emit("habit", id);
      return next;
    },
    habits() {
      return store.listAll().filter((t) => t.habit && t.status !== "finished");
    },
    habitReminders(date = todayLocal()) {
      return incompleteReminders(date, options.habitSummary);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    close() {
      store.close();
    },
  };
}
