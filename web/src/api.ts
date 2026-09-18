import type {
  EvalResult,
  EvalTask,
  JobRow,
  MemoryHit,
  Message,
  SessionRow,
  Snapshot,
  Status,
} from "./types";

export async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function postJSON<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data?.error || `${path}: HTTP ${res.status}`);
  return data;
}

export async function delJSON<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: "DELETE" });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

export const api = {
  snapshot: () => getJSON<Snapshot>("/api/snapshot"),
  status: () => getJSON<Status>("/api/status"),
  sessions: () => getJSON<{ sessions: SessionRow[]; count: number }>("/api/sessions"),
  session: (id: string, lines = 300) =>
    getJSON<{
      info: SessionRow;
      messages: Message[];
      transcript: string;
      events: Record<string, unknown>[];
      pending_inbox: Record<string, unknown>[];
    }>(`/api/sessions/${encodeURIComponent(id)}?lines=${lines}`),
  cancel: (id: string) => postJSON<{ ok: boolean }>(`/api/sessions/${id}/cancel`),
  inject: (id: string, message: string) =>
    postJSON<Record<string, unknown>>(`/api/sessions/${id}/inject`, { message }),
  jobs: () => getJSON<{ jobs: JobRow[]; count: number }>("/api/jobs"),
  jobLog: (id: string, offset = 0, lines = 300) =>
    getJSON<{ lines: string[]; next_offset: number; total_lines: number; eof: boolean }>(
      `/api/jobs/${id}/log?offset=${offset}&lines=${lines}`,
    ),
  kill: (id: string) => postJSON<Record<string, unknown>>(`/api/jobs/${id}/kill`),
  memorySearch: (q: string, k = 10) =>
    getJSON<{ hits: MemoryHit[]; count: number }>(
      `/api/memory?q=${encodeURIComponent(q)}&k=${k}`,
    ),
  memoryEntries: () =>
    getJSON<{
      entries: {
        id: string;
        body: string;
        tags: string[];
        importance: number;
        created: string;
        updated: string;
        source: string;
        relations: Record<string, string[]>;
        archived: boolean;
      }[];
      count: number;
    }>("/api/memory/entries"),
  memorySave: (body: string, tags: string[], importance: number) =>
    postJSON<{ ok: boolean; entry_id: string }>("/api/memory", { body, tags, importance }),
  memoryForget: (id: string) => delJSON<{ ok: boolean }>(`/api/memory/${id}`),
  evalResults: () => getJSON<{ results: EvalResult[] }>("/api/evals/results?limit=200"),
  evalTasks: () => getJSON<{ tasks: EvalTask[] }>("/api/evals/tasks"),
  evalRun: () => postJSON<Record<string, unknown>>("/api/evals/run", {}),
  releases: () => getJSON<Record<string, unknown>>("/api/releases"),
  revert: (release_id?: string) =>
    postJSON<Record<string, unknown>>("/api/releases/revert", release_id ? { release_id } : {}),
  tools: () => getJSON<Record<string, unknown>>("/api/tools"),
};

export interface ChatHandlers {
  onEvent: (event: string, data: Record<string, unknown>) => void;
  signal?: AbortSignal;
}

export async function streamChat(
  message: string,
  sessionId: string | null,
  handlers: ChatHandlers,
): Promise<void> {
  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, session_id: sessionId }),
    signal: handlers.signal,
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(detail || `chat stream failed: HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      if (!frame.trim() || frame.startsWith(":")) continue;
      let event = "message";
      const dataLines: string[] = [];
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (!dataLines.length) continue;
      try {
        handlers.onEvent(event, JSON.parse(dataLines.join("\n")) as Record<string, unknown>);
      } catch {
        handlers.onEvent(event, { raw: dataLines.join("\n") });
      }
    }
  }
}
