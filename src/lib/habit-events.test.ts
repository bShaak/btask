import { describe, expect, test } from "bun:test";
import { habituiEventsUrl, parseHabitEvent, subscribeHabitEvents } from "./habit-events.ts";

function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    saved[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(saved)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

describe("habit-events", () => {
  test("derives the websocket url from the base", () => {
    expect(habituiEventsUrl("http://127.0.0.1:8080")).toBe("ws://127.0.0.1:8080/api/v1/events");
    expect(habituiEventsUrl("http://127.0.0.1:8080/")).toBe("ws://127.0.0.1:8080/api/v1/events");
    withEnv({ HABITUI_URL: "http://127.0.0.1:9999" }, () => {
      expect(habituiEventsUrl()).toBe("ws://127.0.0.1:9999/api/v1/events");
    });
  });

  test("parses habit.completed and ignores the rest", () => {
    const event = parseHabitEvent(
      JSON.stringify({ type: "habit.completed", habit_id: 5, habit_name: "Read", date: "2026-09-08", completion_count: 2, goal: 2 })
    );
    expect(event).toEqual({ type: "habit.completed", habit_id: 5, habit_name: "Read", date: "2026-09-08", completion_count: 2, goal: 2 });
    expect(parseHabitEvent(JSON.stringify({ type: "other" }))).toBeNull();
    expect(parseHabitEvent("not json")).toBeNull();
  });

  test("delivers live events to the handler", async () => {
    const clients = new Set<import("bun").ServerWebSocket<unknown>>();
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch(req, server) {
        if (new URL(req.url).pathname === "/api/v1/events" && server.upgrade(req)) return;
        return new Response("not found", { status: 404 });
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
    const url = `ws://${server.hostname}:${server.port}/api/v1/events`;
    const received: string[] = [];
    const stop = subscribeHabitEvents((ev) => received.push(ev.date), { url, retryMs: 50 });
    const deadline = Date.now() + 2000;
    while (clients.size === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
    }
    expect(clients.size).toBe(1);
    for (const ws of clients) {
      ws.send(JSON.stringify({ type: "habit.completed", habit_id: 1, date: "2026-09-08", completion_count: 1, goal: 1 }));
      ws.send(JSON.stringify({ type: "noise" }));
    }
    const got = Date.now() + 2000;
    while (received.length === 0 && Date.now() < got) {
      await new Promise((r) => setTimeout(r, 25));
    }
    stop();
    server.stop();
    expect(received).toEqual(["2026-09-08"]);
  });
});
