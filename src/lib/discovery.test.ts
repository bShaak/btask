import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectProject, portFilePath, resolveUrl } from "./discovery.ts";

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

describe("discovery", () => {
  test("prefers BTASK_URL over everything", () => {
    const home = mkdtempSync(join(tmpdir(), "btask-home-"));
    writeFileSync(join(home, "btask.port"), "http://127.0.0.1:9999");
    withEnv({ HOME: home, BTASK_URL: "http://127.0.0.1:4000" }, () => {
      expect(resolveUrl()).toBe("http://127.0.0.1:4000");
    });
  });

  test("falls back to the port file then the default", () => {
    const home = mkdtempSync(join(tmpdir(), "btask-home-"));
    mkdirSync(join(home, ".btask"), { recursive: true });
    withEnv({ HOME: home, BTASK_URL: undefined }, () => {
      expect(resolveUrl()).toBe("http://127.0.0.1:3000");
      expect(portFilePath()).toBe(join(home, ".btask", "btask.port"));
    });
    writeFileSync(join(home, ".btask", "btask.port"), "http://127.0.0.1:9999\n");
    withEnv({ HOME: home, BTASK_URL: undefined }, () => {
      expect(resolveUrl()).toBe("http://127.0.0.1:9999");
    });
  });

  test("detects the project from the git root", () => {
    expect(detectProject("/home/beed/projects/agents/btask")).toBe("btask");
    expect(detectProject("/tmp/btask-no-repo-xyz")).toBeNull();
  });
});
