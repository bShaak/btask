import type { Service, TaskEvent } from "../api/service.ts";

export type AsyncService = {
  [K in keyof Service]: Service[K] extends (...args: infer A) => infer R
    ? (...args: A) => Promise<Awaited<R>>
    : never;
};

export function asClient(svc: Service): AsyncService {
  const client = {} as Record<string, (...args: never[]) => Promise<unknown>>;
  for (const key of ["create", "get", "list", "setStatus", "update", "remove", "complete", "setHabit", "habits", "habitReminders", "context"] as const) {
    client[key] = async (...args: never[]) =>
      (svc[key] as (...a: never[]) => unknown)(...args);
  }
  client["subscribe"] = async (listener: (event: TaskEvent) => void) =>
    svc.subscribe(listener);
  client["close"] = async () => svc.close();
  return client as AsyncService;
}

export async function probeDaemon(baseUrl: string, timeoutMs = 1500): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return false;
    const body = (await res.json()) as { status?: string };
    return body.status === "ok";
  } catch {
    return false;
  }
}

export function createRemoteService(baseUrl: string): AsyncService {
  const sockets = new Set<WebSocket>();
  async function request(path: string, init?: RequestInit): Promise<unknown> {
    let res: Response;
    try {
      res = await fetch(`${baseUrl}${path}`, init);
    } catch (err) {
      throw new Error(`daemon unreachable at ${baseUrl}: ${err instanceof Error ? err.message : String(err)}`);
    }
    const body = (await res.json()) as unknown;
    if (!res.ok) {
      const message =
        typeof body === "object" && body !== null && "error" in body
          ? String((body as { error: unknown }).error)
          : `request failed: ${res.status}`;
      throw new Error(message);
    }
    return body;
  }

  const send = (method: string, body?: unknown): Promise<unknown> =>
    request("/api/v1/tasks", {
      method,
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  const client: AsyncService = {
    create: (args) => send("POST", args) as Promise<never>,
    get: (id) => request(`/api/v1/tasks/${id}`) as Promise<never>,
    list: (filter) =>
      request(`/api/v1/tasks${filter?.project ? `?project=${encodeURIComponent(filter.project)}` : ""}`) as Promise<never>,
    setStatus: (id, status, actor) =>
      request(`/api/v1/tasks/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status, actor }),
      }) as Promise<never>,
    update: (id, patch) =>
      request(`/api/v1/tasks/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      }) as Promise<never>,
    remove: (id, actor) =>
      request(`/api/v1/tasks/${id}${actor ? `?actor=${encodeURIComponent(actor)}` : ""}`, {
        method: "DELETE",
      }) as Promise<never>,
    complete: (id, summary, actor) =>
      request(`/api/v1/tasks/${id}/complete`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ summary, actor }),
      }) as Promise<never>,
    setHabit: (id, habit, actor) =>
      request(`/api/v1/tasks/${id}/habit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ habit, actor }),
      }) as Promise<never>,
    habits: () => request("/api/v1/habits/local") as Promise<never>,
    habitReminders: (date) =>
      request(`/api/v1/habits${date ? `?date=${encodeURIComponent(date)}` : ""}`) as Promise<never>,
    context: () => request("/api/v1/context") as Promise<never>,
    subscribe: async (listener) => {
      const ws = new WebSocket(`${baseUrl.replace(/^http/, "ws")}/events`);
      sockets.add(ws);
      ws.addEventListener("message", (evt) => listener(JSON.parse(String(evt.data)) as TaskEvent));
      await new Promise<void>((resolve, reject) => {
        ws.addEventListener("open", () => resolve());
        ws.addEventListener("error", () => reject(new Error(`daemon unreachable at ${baseUrl}`)));
      });
      return () => {
        sockets.delete(ws);
        ws.close();
      };
    },
    close: async () => {
      for (const ws of sockets) ws.close();
      sockets.clear();
    },
  };
  return client;
}
