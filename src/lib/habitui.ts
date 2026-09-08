export type HabitReminder = {
  source: "habitui";
  id: string;
  title: string;
  goal: number;
  completionCount: number;
  date: string;
};

export type HabitSummaryEntry = {
  id: number;
  name: string;
  goal: number;
  due: boolean;
  complete: boolean;
  completion_count: number;
};

export type DaySummary = {
  date: string;
  habits: HabitSummaryEntry[];
};

export type SummaryRunner = (date: string) => string;

import { existsSync } from "node:fs";

export function resolveHabituiBin(): string {
  const configured = process.env["HABITUI_BIN"];
  if (configured) return configured;
  for (const dir of (process.env["PATH"] ?? "").split(":")) {
    if (dir && existsSync(`${dir}/habitui`)) return "habitui";
  }
  const home = process.env["HOME"] ?? "";
  const fallbacks = [
    ...(home ? [`${home}/go/bin/habitui`, `${home}/.local/bin/habitui`] : []),
    "/usr/local/bin/habitui",
    "/usr/bin/habitui",
  ];
  for (const path of fallbacks) {
    if (existsSync(path)) return path;
  }
  return "habitui";
}

export function defaultRunner(date: string): string {
  const bin = resolveHabituiBin();
  let proc: { exitCode: number | null; stdout: Uint8Array; stderr: Uint8Array };
  try {
    proc = Bun.spawnSync([bin, "cli", "list", "--json", "--date", date], {
      stdout: "pipe",
      stderr: "pipe",
    });
  } catch {
    throw new Error(
      `habitui cli not found (bin=${bin}). Install habitui, set HABITUI_BIN, or use \`btask habits --local\`.`
    );
  }
  if (proc.exitCode !== 0) {
    const detail = proc.stderr.toString().trim();
    throw new Error(
      `habitui cli failed (bin=${bin}, date=${date})${detail ? `: ${detail}` : ""}. Install habitui or set HABITUI_BIN.`
    );
  }
  return proc.stdout.toString();
}

export function fetchDaySummary(date: string, run: SummaryRunner = defaultRunner): DaySummary {
  return JSON.parse(run(date)) as DaySummary;
}

export function incompleteReminders(date: string, run: SummaryRunner = defaultRunner): HabitReminder[] {
  const summary = fetchDaySummary(date, run);
  return summary.habits
    .filter((h) => h.due && !h.complete)
    .map((h) => ({
      source: "habitui" as const,
      id: String(h.id),
      title: h.name,
      goal: h.goal,
      completionCount: h.completion_count,
      date: summary.date,
    }));
}

export function todayLocal(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}
