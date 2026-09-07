import { Database } from "bun:sqlite";

export type Status = "todo" | "in_progress" | "finished";

export type Task = {
  id: string;
  title: string;
  notes: string;
  parentId: string | null;
  status: Status;
  habit: boolean;
  createdAt: number;
};

export type CreateInput = {
  title: string;
  notes?: string;
  parentId?: string;
  habit?: boolean;
};

export type TaskStore = {
  create: (input: CreateInput & { id: string; createdAt: number }) => Task;
  get: (id: string) => Task | null;
  listAll: () => Task[];
  setStatus: (id: string, status: Status) => Task | null;
  update: (id: string, patch: { title: string; notes: string }) => Task | null;
  setHabit: (id: string, habit: boolean) => Task | null;
  remove: (id: string) => void;
  close: () => void;
};

const STATUSES: ReadonlySet<string> = new Set(["todo", "in_progress", "finished"]);

export function openStore(path: string): TaskStore {
  const db = new Database(path, { create: true });
  db.run(
    `CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      parentId TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      habit INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL
    )`
  );
  const insert = db.prepare(
    `INSERT INTO tasks (id, title, notes, parentId, status, habit, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  const byId = db.prepare(`SELECT * FROM tasks WHERE id = ?`);
  const all = db.prepare(`SELECT * FROM tasks ORDER BY rowid ASC`);
  const updateStatus = db.prepare(`UPDATE tasks SET status = ? WHERE id = ?`);
  const updateFields = db.prepare(`UPDATE tasks SET title = ?, notes = ? WHERE id = ?`);
  const updateHabit = db.prepare(`UPDATE tasks SET habit = ? WHERE id = ?`);
  const deleteById = db.prepare(`DELETE FROM tasks WHERE id = ?`);

  function rowToTask(row: Record<string, unknown>): Task {
    const status = String(row["status"]);
    return {
      id: String(row["id"]),
      title: String(row["title"]),
      notes: String(row["notes"] ?? ""),
      parentId: row["parentId"] == null ? null : String(row["parentId"]),
      status: (STATUSES.has(status) ? status : "todo") as Status,
      habit: Number(row["habit"] ?? 0) === 1,
      createdAt: Number(row["createdAt"] ?? 0),
    };
  }

  return {
    create(input) {
      insert.run(
        input.id,
        input.title,
        input.notes ?? "",
        input.parentId ?? null,
        "todo",
        input.habit ? 1 : 0,
        input.createdAt
      );
      return this.get(input.id) as Task;
    },
    get(id) {
      const row = byId.get(id) as Record<string, unknown> | null;
      return row ? rowToTask(row) : null;
    },
    listAll() {
      return (all.all() as Record<string, unknown>[]).map(rowToTask);
    },
    setStatus(id, status) {
      updateStatus.run(status, id);
      return this.get(id);
    },
    update(id, patch) {
      updateFields.run(patch.title, patch.notes, id);
      return this.get(id);
    },
    setHabit(id, habit) {
      updateHabit.run(habit ? 1 : 0, id);
      return this.get(id);
    },
    remove(id) {
      deleteById.run(id);
    },
    close() {
      db.close();
    },
  };
}
