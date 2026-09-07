import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createService } from "../api/service.ts";
import { createServer } from "./server.ts";

let stop: (() => void) | null = null;
afterEach(() => {
  stop?.();
  stop = null;
});

async function boot() {
  const dir = mkdtempSync(join(tmpdir(), "btask-srv-"));
  const svc = createService(":memory:", { artifactDir: join(dir, "artifacts") });
  const srv = createServer(svc, { port: 0 });
  stop = () => {
    srv.stop();
    svc.close();
  };
  return srv.url;
}

async function post(url: string, body: unknown): Promise<{ status: number; json: unknown }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json() };
}

describe("http server", () => {
  test("round-trips tasks with CLI semantics", async () => {
    const url = await boot();
    const created = await post(`${url}/tasks`, { title: "Ship" });
    expect(created.status).toBe(201);
    const id = (created.json as { id: string }).id;
    const fetched = await fetch(`${url}/tasks/${id}`);
    expect(fetched.status).toBe(200);
    const patched = await fetch(`${url}/tasks/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: "in_progress" }),
    });
    expect(((await patched.json()) as { status: string }).status).toBe("in_progress");
    const listed = (await (await fetch(`${url}/tasks`)).json()) as Array<{ task: { id: string } }>;
    expect(listed.map((n) => n.task.id)).toEqual([id]);
    const gone = await fetch(`${url}/tasks/${id}`, { method: "DELETE" });
    expect(gone.status).toBe(200);
    expect((await (await fetch(`${url}/tasks`)).json()) as unknown[]).toEqual([]);
  });

  test("returns 404 for missing tasks and 400 for bad input", async () => {
    const url = await boot();
    expect((await fetch(`${url}/tasks/nope`)).status).toBe(404);
    const bad = await post(`${url}/tasks`, { title: "  " });
    expect(bad.status).toBe(400);
  });

  test("completes a goal and exposes context", async () => {
    const url = await boot();
    const goal = (await (await post(`${url}/tasks`, { title: "Ship" })).json) as { id: string };
    await post(`${url}/tasks`, { title: "Store", parentId: goal.id });
    const done = await post(`${url}/tasks/${goal.id}/complete`, { summary: "v1" });
    expect(done.status).toBe(200);
    expect(((done.json as { status: string }).status)).toBe("finished");
    const ctx = (await (await fetch(`${url}/context`)).json()) as Array<{ id: string }>;
    expect(ctx.map((t) => t.id)).toEqual([goal.id]);
  });

  test("broadcasts task-change events over websocket", async () => {
    const url = await boot();
    const ws = new WebSocket(`${url.replace("http", "ws")}/events`);
    const received: unknown[] = [];
    await new Promise<void>((resolve) => ws.addEventListener("open", () => resolve()));
    ws.addEventListener("message", (evt) => received.push(JSON.parse(String(evt.data))));
    await post(`${url}/tasks`, { title: "Ship" });
    const deadline = Date.now() + 2000;
    while (received.length === 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 25));
    }
    ws.close();
    expect(received).toEqual([{ action: "created", id: (received[0] as { id: string }).id }]);
  });
});
