import { describe, expect, test } from "bun:test";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultRunner, resolveHabituiBin } from "./habitui.ts";

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

function stubBin(dir: string, name: string, script: string): string {
  mkdirSync(dir, { recursive: true });
  const path = join(dir, name);
  writeFileSync(path, script);
  chmodSync(path, 0o755);
  return path;
}

describe("resolveHabituiBin", () => {
  test("respects HABITUI_BIN over everything", () => {
    withEnv({ HABITUI_BIN: "/custom/habitui" }, () => {
      expect(resolveHabituiBin()).toBe("/custom/habitui");
    });
  });

  test("uses PATH when the binary is on it", () => {
    const dir = mkdtempSync(join(tmpdir(), "btask-path-"));
    stubBin(dir, "habitui", "#!/bin/sh\necho hi\n");
    withEnv({ HABITUI_BIN: undefined, PATH: dir, HOME: mkdtempSync(join(tmpdir(), "btask-empty-home-")) }, () => {
      expect(resolveHabituiBin()).toBe("habitui");
    });
  });

  test("falls back to well-known install locations when PATH lacks it", () => {
    const home = mkdtempSync(join(tmpdir(), "btask-home-"));
    stubBin(join(home, "go", "bin"), "habitui", "#!/bin/sh\necho hi\n");
    withEnv({ HABITUI_BIN: undefined, PATH: "/nonexistent", HOME: home }, () => {
      expect(resolveHabituiBin()).toBe(join(home, "go", "bin", "habitui"));
    });
  });

  test("returns the bare name when nothing is found", () => {
    withEnv(
      { HABITUI_BIN: undefined, PATH: "/nonexistent", HOME: mkdtempSync(join(tmpdir(), "btask-empty-home-")) },
      () => {
        expect(resolveHabituiBin()).toBe("habitui");
      }
    );
  });
});

describe("defaultRunner", () => {
  test("runs the resolved binary and returns stdout", () => {
    const dir = mkdtempSync(join(tmpdir(), "btask-runner-"));
    const bin = stubBin(dir, "habitui", '#!/bin/sh\necho {"date":"2026-09-07","habits":[]}\n');
    withEnv({ HABITUI_BIN: bin }, () => {
      expect(defaultRunner("2026-09-07")).toContain("2026-09-07");
    });
  });

  test("throws a helpful error when the binary is missing", () => {
    withEnv({ HABITUI_BIN: "/nonexistent/habitui", PATH: "/nonexistent" }, () => {
      expect(() => defaultRunner("2026-09-07")).toThrow("habitui cli not found");
    });
  });
});
