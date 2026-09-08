import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

export const DEFAULT_PORT = 3000;
export const DEFAULT_URL = `http://127.0.0.1:${DEFAULT_PORT}`;

export function homeDir(): string {
  return process.env["HOME"] ?? homedir();
}

export function defaultDbPath(): string {
  if (process.env["BTASK_DB"]) return process.env["BTASK_DB"] as string;
  return join(homeDir(), ".btask", "btask.db");
}

export function defaultArtifactDir(): string {
  if (process.env["BTASK_ARTIFACTS"]) return process.env["BTASK_ARTIFACTS"] as string;
  return join(homeDir(), ".btask", "artifacts");
}

export function portFilePath(): string {
  return join(homeDir(), ".btask", "btask.port");
}

export function resolveUrl(): string {
  if (process.env["BTASK_URL"]) return process.env["BTASK_URL"] as string;
  const file = portFilePath();
  if (existsSync(file)) {
    const url = readFileSync(file, "utf8").trim();
    if (url.startsWith("http")) return url;
  }
  return DEFAULT_URL;
}

export function ensureDirFor(file: string): void {
  mkdirSync(dirnameOf(file), { recursive: true });
}

function dirnameOf(file: string): string {
  return file.split("/").slice(0, -1).join("/") || ".";
}

export function detectProject(cwd: string = process.cwd()): string | null {
  try {
    const proc = Bun.spawnSync(["git", "-C", cwd, "rev-parse", "--show-toplevel"], {
      stdout: "pipe",
      stderr: "pipe",
    });
    if (proc.exitCode !== 0) return null;
    const root = proc.stdout.toString().trim();
    if (!root) return null;
    return basename(root);
  } catch {
    return null;
  }
}
