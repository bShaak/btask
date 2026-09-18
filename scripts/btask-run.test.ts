import { describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const REPO_ROOT = join(dirname(new URL(import.meta.url).pathname), "..");
const SCRIPT = join(REPO_ROOT, "scripts", "btask-run.sh");
const CLI = join(REPO_ROOT, "src", "cli.ts");

type Harness = {
  env: Record<string, string>;
  taskId: string;
};

function writeExec(path: string, body: string): void {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

// Isolated supervisor playground: temp HOME + temp BTASK_DB, a `btask` shim
// resolving to this checkout's CLI, and a stub `opencode` whose behavior each
// test defines. Nothing touches the real ~/.btask database.
function makeHarness(opencodeStub: string): Harness {
  const dir = mkdtempSync(join(tmpdir(), "btask-run-test-"));
  const bin = join(dir, "bin");
  const home = join(dir, "home");
  Bun.spawnSync(["mkdir", "-p", bin, home]);
  writeExec(join(bin, "btask"), `#!/bin/sh\nexec bun "${CLI}" "$@"\n`);
  writeExec(join(bin, "opencode"), opencodeStub);
  const baseEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (v !== undefined) baseEnv[k] = v;
  }
  const env: Record<string, string> = {
    ...baseEnv,
    HOME: home,
    BTASK_DB: join(dir, "btask.db"),
    BTASK_ARTIFACTS: join(dir, "artifacts"),
    PATH: `${bin}:${process.env["PATH"] ?? ""}`,
  };
  const created = Bun.spawnSync(["bun", CLI, "create", "supervised work"], {
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(created.exitCode).toBe(0);
  const taskId = (JSON.parse(created.stdout.toString()) as { id: string }).id;
  return { env: { ...env, BTASK_TASK: taskId }, taskId };
}

function runScript(h: Harness, args: string[]): { code: number; out: string } {
  const proc = Bun.spawnSync(["sh", SCRIPT, ...args], {
    env: h.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    code: proc.exitCode ?? -1,
    out: proc.stdout.toString() + proc.stderr.toString(),
  };
}

describe("scripts/btask-run.sh", () => {
  test("fails when the agent exits 0 but leaves the task unfinished", () => {
    const h = makeHarness(`#!/bin/sh\nexit 0\n`);
    const result = runScript(h, ["--task", h.taskId, "--", "do the work"]);
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/not finished/);
  });

  test("succeeds when the agent finishes the tracked task", () => {
    const h = makeHarness(`#!/bin/sh\nbtask status "$BTASK_TASK" finished >/dev/null\nexit 0\n`);
    const result = runScript(h, ["--task", h.taskId, "--", "do the work"]);
    expect(result.code).toBe(0);
    expect(result.out).toMatch(/all gates passed/);
  });

  test("propagates the opencode exit code without running gates", () => {
    const h = makeHarness(`#!/bin/sh\nexit 3\n`);
    const result = runScript(h, ["--task", h.taskId, "--", "do the work"]);
    expect(result.code).toBe(3);
  });

  test("fails when --verify fails even if the task is finished", () => {
    const h = makeHarness(`#!/bin/sh\nbtask status "$BTASK_TASK" finished >/dev/null\nexit 0\n`);
    const result = runScript(h, ["--task", h.taskId, "--verify", "exit 2", "--", "do the work"]);
    expect(result.code).toBe(1);
    expect(result.out).toMatch(/verify gate failed/);
  });

  test("succeeds with a passing --verify command", () => {
    const h = makeHarness(`#!/bin/sh\nbtask status "$BTASK_TASK" finished >/dev/null\nexit 0\n`);
    const result = runScript(h, ["--task", h.taskId, "--verify", "true", "--", "do the work"]);
    expect(result.code).toBe(0);
  });

  test("fails for an unknown task id", () => {
    const h = makeHarness(`#!/bin/sh\nexit 0\n`);
    const result = runScript(h, ["--task", "no-such-task", "--", "do the work"]);
    expect(result.code).toBe(1);
  });

  test("requires --task and a prompt", () => {
    const h = makeHarness(`#!/bin/sh\nexit 0\n`);
    expect(runScript(h, ["--", "do the work"]).code).toBe(2);
    expect(runScript(h, ["--task", h.taskId]).code).toBe(2);
  });
});
