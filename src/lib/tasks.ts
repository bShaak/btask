import { Database } from "bun:sqlite";

export type Status = "todo" | "in_progress" | "finished";

export type Task = {
  id: string;
  title: string;
  notes: string;
  parentId: string | null;
  status: Status;
  habit: boolean;
  project: string | null;
  actor: string | null;
  externalId: string | null;
  archived: boolean;
  createdAt: number;
};

export type CreateInput = {
  title: string;
  notes?: string;
  parentId?: string;
  habit?: boolean;
  project?: string | null;
  actor?: string | null;
  externalId?: string | null;
};

export type TaskStore = {
  create: (input: CreateInput & { id: string; createdAt: number }) => Task;
  get: (id: string) => Task | null;
  byExternalId: (externalId: string) => Task | null;
  listAll: () => Task[];
  setStatus: (id: string, status: Status) => Task | null;
  update: (id: string, patch: { title: string; notes: string; actor?: string | null }) => Task | null;
  setHabit: (id: string, habit: boolean) => Task | null;
  setArchived: (id: string, archived: boolean) => Task | null;
  remove: (id: string) => void;
  close: () => void;
};

const STATUSES: ReadonlySet<string> = new Set(["todo", "in_progress", "finished"]);

export function openStore(path: string): TaskStore {
  const db = new Database(path, { create: true });
  // The TUI polls listAll() every 500ms while CLI invocations write from
  // separate processes. WAL lets readers proceed during writes and
  // busy_timeout makes transient locks wait instead of throwing
  // SQLITE_BUSY ("database is locked").
  db.query(`PRAGMA journal_mode = WAL`).get();
  db.query(`PRAGMA busy_timeout = 5000`).get();
  db.query(`PRAGMA synchronous = NORMAL`).get();
  db.run(
    `CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      notes TEXT NOT NULL DEFAULT '',
      parentId TEXT,
      status TEXT NOT NULL DEFAULT 'todo',
      habit INTEGER NOT NULL DEFAULT 0,
      project TEXT,
      actor TEXT,
      externalId TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      createdAt INTEGER NOT NULL
    )`
  );
  const columns = (db.query(`PRAGMA table_info(tasks)`).all() as Array<{ name: string }>).map(
    (c) => c.name
  );
  if (!columns.includes("project")) db.run(`ALTER TABLE tasks ADD COLUMN project TEXT`);
  if (!columns.includes("actor")) db.run(`ALTER TABLE tasks ADD COLUMN actor TEXT`);
  if (!columns.includes("externalId")) db.run(`ALTER TABLE tasks ADD COLUMN externalId TEXT`);
  if (!columns.includes("archived")) db.run(`ALTER TABLE tasks ADD COLUMN archived INTEGER NOT NULL DEFAULT 0`);
  const insert = db.prepare(
    `INSERT INTO tasks (id, title, notes, parentId, status, habit, project, actor, externalId, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const byId = db.prepare(`SELECT * FROM tasks WHERE id = ?`);
  const byExternal = db.prepare(`SELECT * FROM tasks WHERE externalId = ?`);
  const all = db.prepare(`SELECT * FROM tasks ORDER BY rowid ASC`);
  const updateStatus = db.prepare(`UPDATE tasks SET status = ? WHERE id = ?`);
  const updateFields = db.prepare(`UPDATE tasks SET title = ?, notes = ?, actor = ? WHERE id = ?`);
  const updateHabit = db.prepare(`UPDATE tasks SET habit = ? WHERE id = ?`);
  const updateArchived = db.prepare(`UPDATE tasks SET archived = ? WHERE id = ?`);
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
      project: row["project"] == null ? null : String(row["project"]),
      actor: row["actor"] == null ? null : String(row["actor"]),
      externalId: row["externalId"] == null ? null : String(row["externalId"]),
      archived: Number(row["archived"] ?? 0) === 1,
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
        input.project ?? null,
        input.actor ?? null,
        input.externalId ?? null,
        input.createdAt
      );
      return this.get(input.id) as Task;
    },
    get(id) {
      const row = byId.get(id) as Record<string, unknown> | null;
      return row ? rowToTask(row) : null;
    },
    byExternalId(externalId) {
      const row = byExternal.get(externalId) as Record<string, unknown> | null;
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
      const current = this.get(id);
      updateFields.run(patch.title, patch.notes, patch.actor === undefined ? (current?.actor ?? null) : patch.actor, id);
      return this.get(id);
    },
    setHabit(id, habit) {
      updateHabit.run(habit ? 1 : 0, id);
      return this.get(id);
    },
    setArchived(id, archived) {
      updateArchived.run(archived ? 1 : 0, id);
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
