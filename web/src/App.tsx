import { useState } from "react";
import { AgentsView } from "./components/AgentsView";
import { ChatView } from "./components/ChatView";
import { DashboardView } from "./components/DashboardView";
import { EvalsView } from "./components/EvalsView";
import { JobsView } from "./components/JobsView";
import { MemoryView } from "./components/MemoryView";
import { Badge, fmtNum } from "./components/ui";
import { useSnapshot } from "./hooks/useSnapshot";

const TABS = [
  ["dashboard", "Dashboard"],
  ["chat", "Chat"],
  ["agents", "Agents"],
  ["jobs", "Jobs"],
  ["memory", "Memory"],
  ["evals", "Evals & Releases"],
] as const;

type Tab = (typeof TABS)[number][0];

export default function App() {
  const { snapshot, connected, error, refresh } = useSnapshot();
  const [tab, setTab] = useState<Tab>("dashboard");
  const status = snapshot?.status;
  const agent = status?.agent;

  return (
    <>
      <header className="topbar">
        <div className="brand">
          <span>Aviary</span> console
        </div>
        <div className="meta">
          <span>
            agent <strong>{agent?.agent_id ?? "-"}</strong>
          </span>
          <span>release {agent?.release_id ?? "-"}</span>
          {agent?.commit_sha && agent.commit_sha !== "unknown" ? (
            <span className="mono">{agent.commit_sha.slice(0, 8)}</span>
          ) : null}
          <span>
            tokens {fmtNum((status?.tokens_today.tokens_in ?? 0) + (status?.tokens_today.tokens_out ?? 0))}
          </span>
          {status?.last_deploy_flagged ? <Badge tone="yellow">deploy flagged</Badge> : null}
        </div>
        <span className="spacer" />
        <Badge tone={connected ? "green" : "red"}>{connected ? "live" : "disconnected"}</Badge>
      </header>

      <nav className="tabs">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            className={`tab${tab === id ? " active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      <main className="main">
        {error ? (
          <div className="error" style={{ marginBottom: 12 }}>
            Console API unreachable ({error}). Retrying every 3s - make sure the server is
            running on this host and port.
          </div>
        ) : null}
        {tab === "dashboard" && <DashboardView snapshot={snapshot} />}
        {tab === "chat" && <ChatView sessions={snapshot?.sessions ?? []} refresh={refresh} />}
        {tab === "agents" && <AgentsView sessions={snapshot?.sessions ?? []} />}
        {tab === "jobs" && <JobsView jobs={snapshot?.jobs ?? []} />}
        {tab === "memory" && <MemoryView />}
        {tab === "evals" && <EvalsView />}
      </main>
    </>
  );
}
