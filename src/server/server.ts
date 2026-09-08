import type { ServerWebSocket } from "bun";
import { rmSync, writeFileSync } from "node:fs";
import type { Service, Status, TaskEvent } from "../api/service.ts";
import { ensureDirFor } from "../lib/discovery.ts";

export const VERSION = "0.1.0";

export type ServerOptions = {
  port?: number;
  hostname?: string;
  portFile?: string;
};

export type RunningServer = {
  url: string;
  stop: () => void;
};

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}

function failure(err: unknown): Response {
  const message = err instanceof Error ? err.message : String(err);
  return json({ error: message }, message.includes("not found") ? 404 : 400);
}

async function body(req: Request): Promise<{ ok: true; value: Record<string, unknown> } | { ok: false; res: Response }> {
  try {
    const value = (await req.json()) as Record<string, unknown>;
    return { ok: true, value };
  } catch {
    return { ok: false, res: json({ error: "invalid JSON" }, 400) };
  }
}

export function createServer(service: Service, options: ServerOptions = {}): RunningServer {
  const clients = new Set<ServerWebSocket<unknown>>();
  const broadcast = (event: TaskEvent): void => {
    const text = JSON.stringify(event);
    for (const ws of clients) ws.send(text);
  };
  const unsubscribe = service.subscribe(broadcast);

  const server = Bun.serve({
    port: options.port ?? 0,
    hostname: options.hostname ?? "127.0.0.1",
    fetch(req, server) {
      const url = new URL(req.url);
      const parts = url.pathname.split("/").filter((p) => p.length > 0);
      if (parts[0] === "health" && parts.length === 1 && req.method === "GET") {
        return json({ status: "ok", version: VERSION });
      }
      if (parts[0] === "events") {
        if (server.upgrade(req)) return;
        return json({ error: "websocket required" }, 400);
      }
      if (parts[0] !== "api" || parts[1] !== "v1") return json({ error: "not found" }, 404);
      const route = parts.slice(2);
      try {
        if (route[0] === "tasks" && route.length === 1) {
          if (req.method === "GET") {
            const project = url.searchParams.get("project") ?? undefined;
            return json(service.list(project === undefined ? undefined : { project }));
          }
          if (req.method === "POST") return create(req);
        } else if (route[0] === "tasks" && route.length === 2) {
          const id = route[1] as string;
          if (req.method === "GET") {
            const task = service.get(id);
            if (!task) return json({ error: `task not found: ${id}` }, 404);
            return json(task);
          }
          if (req.method === "PATCH") return patch(req, id);
          if (req.method === "DELETE") {
            service.remove(id);
            return json({ deleted: id });
          }
        } else if (route[0] === "tasks" && route.length === 3 && route[2] === "complete") {
          if (req.method === "POST") return complete(req, route[1] as string);
        } else if (route[0] === "tasks" && route.length === 3 && route[2] === "habit") {
          if (req.method === "POST") return habit(req, route[1] as string);
        } else if (route[0] === "context" && route.length === 1 && req.method === "GET") {
          return json(service.context());
        } else if (route[0] === "habits" && route.length === 1 && req.method === "GET") {
          return json(service.habitReminders(url.searchParams.get("date") ?? undefined));
        } else if (route[0] === "habits" && route.length === 2 && route[1] === "local" && req.method === "GET") {
          return json(service.habits());
        }
        return json({ error: "not found" }, 404);
      } catch (err) {
        return failure(err);
      }

      async function create(req: Request): Promise<Response> {
        const parsed = await body(req);
        if (!parsed.ok) return parsed.res;
        const { title, parentId, notes, habit, project } = parsed.value;
        if (typeof title !== "string") return json({ error: "title is required" }, 400);
        try {
          const task = service.create({
            title,
            parentId: typeof parentId === "string" ? parentId : undefined,
            notes: typeof notes === "string" ? notes : undefined,
            habit: typeof habit === "boolean" ? habit : undefined,
            project: typeof project === "string" ? project : undefined,
          });
          return json(task, 201);
        } catch (err) {
          return failure(err);
        }
      }

      async function patch(req: Request, id: string): Promise<Response> {
        const parsed = await body(req);
        if (!parsed.ok) return parsed.res;
        try {
          let task = service.get(id);
          if (!task) return json({ error: `task not found: ${id}` }, 404);
          const { title, notes, status, habit } = parsed.value;
          if (title !== undefined || notes !== undefined) {
            task = service.update(id, {
              title: typeof title === "string" ? title : undefined,
              notes: typeof notes === "string" ? notes : undefined,
            });
          }
          if (status !== undefined) task = service.setStatus(id, status as Status);
          if (habit !== undefined && typeof habit === "boolean") task = service.setHabit(id, habit);
          return json(task);
        } catch (err) {
          return failure(err);
        }
      }

      async function complete(req: Request, id: string): Promise<Response> {
        const parsed = await body(req);
        if (!parsed.ok) return parsed.res;
        try {
          const { summary } = parsed.value;
          return json(service.complete(id, typeof summary === "string" ? summary : undefined));
        } catch (err) {
          return failure(err);
        }
      }

      async function habit(req: Request, id: string): Promise<Response> {
        const parsed = await body(req);
        if (!parsed.ok) return parsed.res;
        try {
          const { habit } = parsed.value;
          if (typeof habit !== "boolean") return json({ error: "habit must be a boolean" }, 400);
          return json(service.setHabit(id, habit));
        } catch (err) {
          return failure(err);
        }
      }
    },
    websocket: {
      open(ws) {
        clients.add(ws);
      },
      close(ws) {
        clients.delete(ws);
      },
      message() {},
    },
  });

  const url = `http://${server.hostname}:${server.port}`;
  if (options.portFile) {
    ensureDirFor(options.portFile);
    writeFileSync(options.portFile, `${url}\n`);
  }

  return {
    url,
    stop: () => {
      unsubscribe();
      server.stop();
      if (options.portFile) rmSync(options.portFile, { force: true });
    },
  };
}
