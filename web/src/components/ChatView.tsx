import { useEffect, useRef, useState } from "react";
import { api, streamChat } from "../api";
import type { Message, SessionRow } from "../types";
import { Badge, Panel, timeAgo } from "./ui";

interface ChatMessage extends Message {
  tools?: { name: string; result: string }[];
  streaming?: boolean;
}

export function ChatView({
  sessions,
  refresh,
}: {
  sessions: SessionRow[];
  refresh: () => void;
}) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const scroller = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [messages]);

  const loadSession = async (id: string | null) => {
    setSessionId(id);
    setError("");
    if (!id) {
      setMessages([]);
      return;
    }
    try {
      const detail = await api.session(id);
      setMessages(detail.messages);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setError("");
    setBusy(true);
    const userMessage: ChatMessage = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage, { role: "assistant", content: "", streaming: true }]);

    const appendAssistant = (chunk: string) =>
      setMessages((prev) => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i -= 1) {
          if (next[i].role === "assistant" && next[i].streaming) {
            next[i] = { ...next[i], content: (next[i].content ?? "") + chunk };
            break;
          }
        }
        return next;
      });

    const addTool = (name: string, result: string) =>
      setMessages((prev) => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i -= 1) {
          if (next[i].role === "assistant" && next[i].streaming) {
            next[i] = { ...next[i], tools: [...(next[i].tools ?? []), { name, result }] };
            break;
          }
        }
        return next;
      });

    controller.current = new AbortController();
    try {
      await streamChat(text, sessionId, {
        signal: controller.current.signal,
        onEvent: (event, data) => {
          if (event === "delta") appendAssistant(String(data.content ?? ""));
          else if (event === "assistant" && typeof data.content === "string") {
            setMessages((prev) => {
              const next = [...prev];
              for (let i = next.length - 1; i >= 0; i -= 1) {
                if (next[i].role === "assistant" && next[i].streaming) {
                  if (!next[i].content) next[i] = { ...next[i], content: String(data.content) };
                  break;
                }
              }
              return next;
            });
          } else if (event === "tool") addTool(String(data.name ?? "tool"), String(data.result ?? ""));
          else if (event === "error") setError(String(data.error ?? "turn failed"));
        },
      });
      setMessages((prev) =>
        prev.map((message) => (message.streaming ? { ...message, streaming: false } : message)),
      );
      const detail = await api.snapshot();
      const consoleSession = detail.sessions.find((row) => row.name === "console");
      if (!sessionId && consoleSession) {
        setSessionId(consoleSession.id);
      }
      refresh();
    } catch (err) {
      if ((err as Error).name !== "AbortError") setError((err as Error).message);
      setMessages((prev) =>
        prev.map((message) => (message.streaming ? { ...message, streaming: false } : message)),
      );
    } finally {
      setBusy(false);
      controller.current = null;
    }
  };

  const cancel = async () => {
    controller.current?.abort();
    if (sessionId) await api.cancel(sessionId).catch(() => undefined);
    setBusy(false);
  };

  const consoleSessions = sessions.filter((session) => !session.worker);

  return (
    <div className="chat-wrap">
      <Panel
        title="Sessions"
        actions={
          <button className="primary" onClick={() => loadSession(null)}>
            new
          </button>
        }
      >
        <div className="session-list">
          {consoleSessions.map((session) => (
            <div
              key={session.id}
              className={`session-item${session.id === sessionId ? " active" : ""}`}
              onClick={() => loadSession(session.id)}
            >
              <div className="name">{session.name || session.id.slice(0, 8)}</div>
              <div className="row" style={{ marginTop: 4 }}>
                <Badge tone={session.status === "running" ? "green" : ""}>{session.status}</Badge>
                <span className="muted" style={{ fontSize: 11 }}>
                  {timeAgo(session.last_activity)}
                </span>
              </div>
            </div>
          ))}
          {!consoleSessions.length && <span className="muted">no sessions yet</span>}
        </div>
      </Panel>

      <div className="chat">
        <div className="messages" ref={scroller}>
          {messages.map((message, index) => (
            <div key={index} className={`msg ${message.role}`}>
              <div className="role">
                {message.role}
                {message.from_agent ? ` @${message.from_agent}` : ""}
                {message.name ? ` (${message.name})` : ""}
              </div>
              {message.content}
              {message.tool_calls?.map((call) => (
                <div key={call.id} className="tool-call">
                  {call.name} {call.arguments}
                </div>
              ))}
              {message.tools?.map((tool, toolIndex) => (
                <div key={toolIndex} className="tool-call">
                  {tool.name}: {tool.result.slice(0, 2000)}
                </div>
              ))}
            </div>
          ))}
          {!messages.length && (
            <div className="muted">
              Send a message to start a session. Tool calls and streaming output appear here.
            </div>
          )}
          {error ? <div className="error">{error}</div> : null}
        </div>
        <div className="chat-input">
          <textarea
            value={input}
            placeholder="Message the agent..."
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send();
              }
            }}
          />
          {busy ? (
            <button className="danger" onClick={() => void cancel()}>
              cancel
            </button>
          ) : (
            <button className="primary" onClick={() => void send()} disabled={!input.trim()}>
              send
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
