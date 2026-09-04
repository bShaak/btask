import { openStore, type Status, type Task } from "../lib/tasks.ts";

export type { Status, Task };
export type TaskNode = { task: Task; children: TaskNode[] };
export type CreateArgs = { title: string; notes?: string; parentId?: string; habit?: boolean };

export type Service = {
  create: (args: CreateArgs) => Task;
  get: (id: string) => Task | null;
  list: () => TaskNode[];
  setStatus: (id: string, status: Status) => Task;
  close: () => void;
};

const VALID: ReadonlySet<string> = new Set(["todo", "in_progress", "finished"]);

export function createService(path: string): Service {
  const store = openStore(path);
  return {
    create(args) {
      const title = args.title.trim();
      if (!title) throw new Error("title is required");
      if (args.parentId) {
        const parent = store.get(args.parentId);
        if (!parent) throw new Error(`parent not found: ${args.parentId}`);
      }
      return store.create({
        id: crypto.randomUUID(),
        title,
        notes: args.notes ?? "",
        parentId: args.parentId,
        habit: args.habit,
        createdAt: Date.now(),
      });
    },
    get(id) {
      return store.get(id);
    },
    list() {
      const tasks = store.listAll();
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
      return store.setStatus(id, status) as Task;
    },
    close() {
      store.close();
    },
  };
}
