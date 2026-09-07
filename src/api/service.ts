import { openStore, type Status, type Task } from "../lib/tasks.ts";

export type { Status, Task };
export type TaskNode = { task: Task; children: TaskNode[] };
export type CreateArgs = { title: string; notes?: string; parentId?: string; habit?: boolean };

export type UpdateArgs = { title?: string; notes?: string };

export type Service = {
  create: (args: CreateArgs) => Task;
  get: (id: string) => Task | null;
  list: () => TaskNode[];
  setStatus: (id: string, status: Status) => Task;
  update: (id: string, patch: UpdateArgs) => Task;
  remove: (id: string) => void;
  context: () => Task[];
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
    update(id, patch) {
      const existing = store.get(id);
      if (!existing) throw new Error(`task not found: ${id}`);
      const title = patch.title === undefined ? existing.title : patch.title.trim();
      if (!title) throw new Error("title is required");
      return store.update(id, {
        title,
        notes: patch.notes === undefined ? existing.notes : patch.notes,
      }) as Task;
    },
    remove(id) {
      const existing = store.get(id);
      if (!existing) throw new Error(`task not found: ${id}`);
      const ids = [id];
      for (let i = 0; i < ids.length; i++) {
        const current = ids[i] as string;
        for (const t of store.listAll()) {
          if (t.parentId === current) ids.push(t.id);
        }
      }
      for (const target of ids) store.remove(target);
    },
    context() {
      return store.listAll();
    },
    close() {
      store.close();
    },
  };
}
