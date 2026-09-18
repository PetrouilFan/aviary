import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import type { Snapshot } from "../types";

export function useSnapshot(): {
  snapshot: Snapshot | null;
  connected: boolean;
  error: string;
  refresh: () => void;
} {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  const timer = useRef<number | null>(null);

  const refresh = useCallback(() => {
    api
      .snapshot()
      .then((snap) => {
        setSnapshot(snap);
        setError("");
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    let source: EventSource | null = null;
    let cancelled = false;

    refresh();

    const connect = () => {
      if (cancelled) return;
      source = new EventSource("/api/events");
      source.addEventListener("snapshot", (event) => {
        try {
          setSnapshot(JSON.parse((event as MessageEvent).data) as Snapshot);
          setConnected(true);
          setError("");
        } catch {
          /* ignore malformed frame */
        }
      });
      source.onerror = () => {
        setConnected(false);
        source?.close();
        if (!cancelled) timer.current = window.setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      cancelled = true;
      source?.close();
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [refresh]);

  return { snapshot, connected, error, refresh };
}
