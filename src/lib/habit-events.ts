export type HabitCompletedEvent = {
  type: string;
  habit_id: number;
  habit_name?: string;
  date: string;
  completion_count: number;
  goal: number;
};

export type HabitEventHandler = (event: HabitCompletedEvent) => void;

export function habituiBaseUrl(): string {
  return process.env["HABITUI_URL"] ?? "http://127.0.0.1:8080";
}

export function habituiEventsUrl(base: string = habituiBaseUrl()): string {
  const trimmed = base.replace(/\/+$/, "");
  return `${trimmed.replace(/^http/, "ws")}/api/v1/events`;
}

export function parseHabitEvent(raw: string): HabitCompletedEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v["type"] !== "habit.completed") return null;
  if (typeof v["habit_id"] !== "number" || typeof v["date"] !== "string") return null;
  if (typeof v["completion_count"] !== "number" || typeof v["goal"] !== "number") return null;
  return {
    type: "habit.completed",
    habit_id: v["habit_id"] as number,
    ...(typeof v["habit_name"] === "string" ? { habit_name: v["habit_name"] as string } : {}),
    date: v["date"] as string,
    completion_count: v["completion_count"] as number,
    goal: v["goal"] as number,
  };
}

export function subscribeHabitEvents(
  handler: HabitEventHandler,
  options: { url?: string; retryMs?: number; onError?: (err: string) => void } = {}
): () => void {
  const url = options.url ?? habituiEventsUrl();
  const retryMs = options.retryMs ?? 5000;
  const onError = options.onError;
  let closed = false;
  let ws: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function connect(): void {
    if (closed) return;
    let socket: WebSocket;
    try {
      socket = new WebSocket(url);
    } catch {
      onError?.(`habitui events unreachable at ${url}`);
      timer = setTimeout(connect, retryMs);
      return;
    }
    ws = socket;
    socket.addEventListener("message", (evt) => {
      const event = parseHabitEvent(String((evt as MessageEvent).data));
      if (event) handler(event);
    });
    socket.addEventListener("close", () => {
      ws = null;
      if (!closed) timer = setTimeout(connect, retryMs);
    });
    socket.addEventListener("error", () => {
      onError?.(`habitui events unreachable at ${url}`);
      try {
        socket.close();
      } catch {
      }
    });
  }

  connect();
  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    try {
      ws?.close();
    } catch {
    }
  };
}
