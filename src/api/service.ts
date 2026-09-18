import { openStore, type Status, type Task } from "../lib/tasks.ts";
import { writeArtifact } from "../lib/artifacts.ts";
import {
  fetchDaySummary,
  incompleteReminders,
  todayLocal,
  type HabitReminder,
  type HabitSummaryEntry,
  type SummaryRunner,
} from "../lib/habitui.ts";
import { defaultArtifactDir } from "../lib/discovery.ts";

export type { HabitReminder };
export type { Status, Task };
export type TaskNode = { task: Task; children: TaskNode[] };
export type CreateArgs = { title: string; notes?: string; parentId?: string; habit?: boolean; project?: string | null; actor?: string | null; externalId?: string | null };

export type UpdateArgs = { title?: string; notes?: string; actor?: string | null };

export type ListFilter = { project?: string; archived?: "active" | "archived" | "all" };

export type HabitCompletion = {
  externalId: string;
  title: string;
  date: string;
  completionCount: number;
  goal: number;
  actor?: string | null;
};

export type HabitSyncResult = {
  goal: Task;
  created: number;
  updated: number;
  archived: string[];
};
export type TaskEventAction = "created" | "updated" | "status" | "removed" | "completed" | "habit" | "archived";
export type TaskEvent = { action: TaskEventAction; id: string; actor: string | null };

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
  setStatus: (id: string, status: Status, actor?: string | null) => Task;
  update: (id: string, patch: UpdateArgs) => Task;
  remove: (id: string, actor?: string | null) => void;
  complete: (id: string, summary?: string, actor?: string | null) => Task;
  setHabit: (id: string, habit: boolean, actor?: string | null) => Task;
  setArchived: (id: string, archived: boolean, actor?: string | null) => Task;
  recordHabitCompletion: (args: HabitCompletion) => Task;
  syncHabits: (date?: string, actor?: string | null) => HabitSyncResult;
  habits: () => Task[];
  habitReminders: (date?: string) => HabitReminder[];
  subscribe: (listener: (event: TaskEvent) => void) => () => void;
  context: () => Task[];
  close: () => void;
};

const VALID: ReadonlySet<string> = new Set(["todo", "in_progress", "finished"]);

const STATUS_ORDER: Record<Status, number> = { todo: 0, in_progress: 1, finished: 2 };

export function createService(path: string, options: ServiceOptions = {}): Service {
  const store = openStore(path);
  const artifactDir = options.artifactDir ?? defaultArtifactDir();
  const now = options.now ?? Date.now;
  const listeners = new Set<(event: TaskEvent) => void>();
  if (options.onEvent) listeners.add(options.onEvent);
  const emit = (action: TaskEventAction, id: string, actor: string | null = null): void => {
    const event = { action, id, actor };
    for (const listener of listeners) listener(event);
  };
  function collectSubtree(rootId: string): string[] {
    const byParent = new Map<string, string[]>();
    for (const t of store.listAll()) {
      if (t.parentId === null) continue;
      const group = byParent.get(t.parentId);
      if (group) group.push(t.id);
      else byParent.set(t.parentId, [t.id]);
    }
    const found: string[] = [];
    const queue = [...(byParent.get(rootId) ?? [])];
    while (queue.length > 0) {
      const current = queue.pop() as string;
      found.push(current);
      queue.push(...(byParent.get(current) ?? []));
    }
    return found;
  }

  function pushHabitCompletion(args: HabitCompletion): Task {
    if (!args.externalId) throw new Error("externalId is required");
    const title = args.title.trim();
    if (!title) throw new Error("title is required");
    const actor = args.actor ?? null;
    let task = store.byExternalId(args.externalId);
    if (!task) {
      task = created(
        store.create({
          id: crypto.randomUUID(),
          title,
          habit: true,
          externalId: args.externalId,
          actor,
          createdAt: Date.now(),
        })
      );
    } else if (task.title !== title) {
      task = store.update(task.id, { title, notes: task.notes }) as Task;
    }
    const met = args.completionCount >= Math.max(1, args.goal);
    const next: Status = met ? "finished" : args.completionCount > 0 ? "in_progress" : "todo";
    if (STATUS_ORDER[next] > STATUS_ORDER[task.status]) {
      return setStatusById(task.id, next, actor);
    }
    return task;
  }

  function setStatusById(id: string, status: Status, actor: string | null): Task {
    const next = store.setStatus(id, status) as Task;
    emit("status", id, actor);
    return next;
  }
  function ensureDailyGoal(date: string, actor: string | null): Task {
    const externalId = `habitui:daily-${date}`;
    const existing = store.byExternalId(externalId);
    if (existing) return existing;
    return created(
      store.create({
        id: crypto.randomUUID(),
        title: `Daily habits ${date}`,
        externalId,
        actor,
        createdAt: Date.now(),
      })
    );
  }

  function syncDueHabit(
    goalId: string,
    habit: HabitSummaryEntry,
    date: string,
    actor: string | null
  ): { created: boolean; updated: boolean } {
    const externalId = `habitui:${habit.id}@${date}`;
    const before = store.byExternalId(externalId);
    let createdHabit = false;
    if (!before) {
      const sub = store.create({
        id: crypto.randomUUID(),
        title: habit.name,
        parentId: goalId,
        habit: true,
        externalId,
        actor,
        createdAt: Date.now(),
      });
      emit("created", sub.id, actor);
      createdHabit = true;
    }
    const statusBefore = (store.byExternalId(externalId) as Task).status;
    pushHabitCompletion({
      externalId,
      title: habit.name,
      date,
      completionCount: habit.completion_count,
      goal: habit.goal,
      actor,
    });
    const statusAfter = (store.byExternalId(externalId) as Task).status;
    return { created: createdHabit, updated: statusAfter !== statusBefore };
  }

  function archiveOldDailyGoals(currentExternalId: string, actor: string | null): string[] {
    const archived: string[] = [];
    for (const task of store.listAll()) {
      if (
        task.externalId?.startsWith("habitui:daily-") &&
        task.externalId !== currentExternalId &&
        !task.archived &&
        task.status !== "finished"
      ) {
        store.setArchived(task.id, true);
        emit("archived", task.id, actor);
        archived.push(task.id);
      }
    }
    return archived;
  }
  const created = (task: Task): Task => {
    emit("created", task.id, task.actor);
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
          actor: args.actor ?? null,
          externalId: args.externalId ?? null,
          createdAt: Date.now(),
        })
      );
    },
    get(id) {
      return store.get(id);
    },
    list(filter: ListFilter = {}) {
      let tasks = store.listAll();
      if (filter.project !== undefined) tasks = tasks.filter((t) => t.project === filter.project);
      const mode = filter.archived ?? "active";
      if (mode !== "all") tasks = tasks.filter((t) => t.archived === (mode === "archived"));
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
    setStatus(id, status, actor = null) {
      if (!VALID.has(status)) throw new Error(`invalid status: ${status}`);
      const existing = store.get(id);
      if (!existing) throw new Error(`task not found: ${id}`);
      return setStatusById(id, status, actor);
    },
    update(id, patch) {
      const existing = store.get(id);
      if (!existing) throw new Error(`task not found: ${id}`);
      const title = patch.title === undefined ? existing.title : patch.title.trim();
      if (!title) throw new Error("title is required");
      const next = store.update(id, {
        title,
        notes: patch.notes === undefined ? existing.notes : patch.notes,
        actor: patch.actor,
      }) as Task;
      emit("updated", id, patch.actor ?? null);
      return next;
    },
    remove(id, actor = null) {
      const existing = store.get(id);
      if (!existing) throw new Error(`task not found: ${id}`);
      store.remove(id);
      for (const target of collectSubtree(id)) store.remove(target);
      emit("removed", id, actor);
    },
    complete(id, summary, actor = null) {
      const goal = store.get(id);
      if (!goal) throw new Error(`task not found: ${id}`);
      const subtree = collectSubtree(id);
      const subtasks = store.listAll().filter((t) => subtree.includes(t.id));
      const finished = store.setStatus(id, "finished") as Task;
      writeArtifact({ dir: artifactDir, goal: finished, subtasks, summary, now: now() });
      for (const target of subtree) store.remove(target);
      emit("completed", id, actor);
      return finished;
    },
    context() {
      return store.listAll();
    },
    setHabit(id, habit, actor = null) {
      const existing = store.get(id);
      if (!existing) throw new Error(`task not found: ${id}`);
      const next = store.setHabit(id, habit) as Task;
      emit("habit", id, actor);
      return next;
    },
    setArchived(id, archived, actor = null) {
      const existing = store.get(id);
      if (!existing) throw new Error(`task not found: ${id}`);
      const next = store.setArchived(id, archived) as Task;
      emit("archived", id, actor);
      return next;
    },
    habits() {
      return store.listAll().filter((t) => t.habit && t.status !== "finished");
    },
    recordHabitCompletion(args: HabitCompletion): Task {
      return pushHabitCompletion(args);
    },
    habitReminders(date = todayLocal()) {
      return incompleteReminders(date, options.habitSummary);
    },
    syncHabits(date = todayLocal(), actor = null) {
      const summary = fetchDaySummary(date, options.habitSummary);
      const goal = ensureDailyGoal(summary.date, actor);
      let createdCount = 0;
      let updated = 0;
      for (const habit of summary.habits.filter((h) => h.due)) {
        const result = syncDueHabit(goal.id, habit, summary.date, actor);
        if (result.created) createdCount += 1;
        if (result.updated) updated += 1;
      }
      const archived = archiveOldDailyGoals(`habitui:daily-${summary.date}`, actor);
      return { goal, created: createdCount, updated, archived };
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
