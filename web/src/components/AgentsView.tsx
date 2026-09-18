import { useEffect, useState } from "react";
import { api } from "../api";
import type { Message, SessionRow } from "../types";
import { Badge, Panel, fmtNum, timeAgo } from "./ui";

export function AgentsView({ sessions }: { sessions: SessionRow[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{
    info: SessionRow;
    messages: Message[];
    events: Record<string, unknown>[];
  } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const data = await api.session(selected, 100);
        if (!cancelled) {
          setDetail({ info: data.info, messages: data.messages, events: data.events });
          setError("");
        }
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      }
    };
    void load();
    const timer = window.setInterval(load, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selected]);

  const roots = sessions.filter((session) => !session.worker);
  const childrenOf = (id: string) => sessions.filter((session) => session.parent_session === id);
  const orphans = sessions.filter(
    (session) => session.worker && !sessions.some((candidate) => candidate.id === session.parent_session),
  );

  const node = (session: SessionRow, depth: number) => (
    <div key={session.id} style={{ marginLeft: depth * 16 }}>
      <div className={`tree-node${session.id === selected ? " active" : ""}`}>
        <div className="tree-head" onClick={() => setSelected(session.id === selected ? null : session.id)}>
          <Badge tone={session.worker ? "purple" : "blue"}>
            {session.worker ? "subagent" : "agent"}
          </Badge>
          <strong>{session.name || session.id.slice(0, 8)}</strong>
          <Badge tone={session.status === "running" ? "green" : ""}>{session.status}</Badge>
          <span className="spacer" />
          <span className="muted" style={{ fontSize: 12 }}>
            ctx {fmtNum(session.context_usage)} · {timeAgo(session.last_activity)}
          </span>
        </div>
      </div>
      <div className="tree-children">
        {childrenOf(session.id).map((child) => node(child, depth + 1))}
      </div>
    </div>
  );

  return (
    <div className="grid two-col">
      <Panel title="Agent tree" actions={<span className="muted">{sessions.length} sessions</span>}>
        <div className="tree">
          {roots.map((session) => node(session, 0))}
          {orphans.map((session) => node(session, 0))}
          {!sessions.length && <span className="muted">no sessions yet</span>}
        </div>
      </Panel>

      <Panel
        title="Session detail"
        actions={
          selected ? (
            <div className="row">
              <button onClick={() => void api.inject(selected, "Status check from console").catch(() => undefined)}>
                ping
              </button>
              <button className="danger" onClick={() => void api.cancel(selected).catch(() => undefined)}>
                cancel
              </button>
            </div>
          ) : null
        }
      >
        {error ? <div className="error">{error}</div> : null}
        {!selected && <span className="muted">Select a session to inspect it.</span>}
        {detail && (
          <div className="stack">
            <div className="row">
              <Badge tone={detail.info.worker ? "purple" : "blue"}>
                {detail.info.worker ? "subagent" : "agent"}
              </Badge>
              <span className="mono">{detail.info.id}</span>
            </div>
            {detail.info.parent_session ? (
              <div className="muted">
                parent: <span className="mono">{detail.info.parent_session}</span>
                {detail.info.branch_point !== null ? ` @ ${detail.info.branch_point}` : ""}
              </div>
            ) : null}
            <div>
              <h3 style={{ marginTop: 0 }}>Messages ({detail.messages.length})</h3>
              <div className="stack">
                {detail.messages.slice(-15).map((message, index) => (
                  <div key={index} className="entry">
                    <div className="head">
                      <Badge>{message.role}</Badge>
                      {message.name ? <span className="muted">{message.name}</span> : null}
                    </div>
                    <div style={{ whiteSpace: "pre-wrap" }}>
                      {(message.content ?? "").slice(0, 1200) || <span className="muted">(empty)</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h3>Events ({detail.events.length})</h3>
              <pre className="log">
                {detail.events
                  .slice(-12)
                  .map((event) => JSON.stringify(event))
                  .join("\n")}
              </pre>
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
