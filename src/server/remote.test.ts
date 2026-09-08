import { describe, expect, test } from "bun:test";
import { createService } from "../api/service.ts";
import { createServer } from "./server.ts";
import { createRemoteService } from "./remote.ts";

describe("remote service", () => {
  test("mirrors direct service output shapes", async () => {
    const direct = createService(":memory:");
    const local = createService(":memory:");
    const server = createServer(local, { port: 0 });
    const remote = createRemoteService(server.url);
    try {
      const goal = await remote.create({ title: "Ship" });
      const { id: _rid, createdAt: _rc, ...remoteShape } = goal;
      const { id: _did, createdAt: _dc, ...directShape } = await direct.create({ title: "Ship" });
      expect(remoteShape).toEqual(directShape);
      const sub = await remote.create({ title: "Store", parentId: goal.id });
      expect(sub.parentId).toBe(goal.id);
      expect(await remote.get(goal.id)).toEqual({ ...goal });
      expect(await remote.list()).toEqual([
        { task: goal, children: [{ task: sub, children: [] }] },
      ]);
      expect((await remote.setStatus(sub.id, "finished")).status).toBe("finished");
      expect((await remote.update(goal.id, { notes: "n" })).notes).toBe("n");
      expect((await remote.setHabit(goal.id, true)).habit).toBe(true);
      expect((await remote.context()).map((t) => t.id).sort()).toEqual([goal.id, sub.id].sort());
      const completed = await remote.complete(goal.id, "v1");
      expect(completed.status).toBe("finished");
      expect(await remote.list()).toEqual([
        { task: { ...completed }, children: [] },
      ]);
      await remote.remove(completed.id);
      expect(await remote.list()).toEqual([]);
    } finally {
      server.stop();
      direct.close();
      local.close();
      remote.close();
    }
  });

  test("throws a clear error when the daemon is unreachable", async () => {
    const remote = createRemoteService("http://127.0.0.1:1");
    await expect(remote.list()).rejects.toThrow();
    remote.close();
  });
});
