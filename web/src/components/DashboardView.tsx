import { useMemo } from "react";
import type { Snapshot } from "../types";
import { Badge, Panel, Sparkline, Stat, fmtNum, timeAgo } from "./ui";

export function DashboardView({ snapshot }: { snapshot: Snapshot | null }) {
  const metrics = snapshot?.metrics ?? [];
  const tokenSeries = useMemo(() => {
    const buckets = new Map<string, number>();
    for (const row of metrics) {
      const key = (row.timestamp ?? "").slice(0, 16);
      buckets.set(key, (buckets.get(key) ?? 0) + (row.tokens_in ?? 0) + (row.tokens_out ?? 0));
    }
    return [...buckets.values()];
  }, [metrics]);

  const status = snapshot?.status;
  const evals = snapshot?.evals ?? [];
  const evalPass = evals.length
    ? Math.round((evals.filter((row) => row.pass).length / evals.length) * 100)
    : null;
  const health = status?.health as Record<string, unknown> | null | undefined;

  return (
    <div className="grid">
      <div className="grid cards">
        <Stat
          label="Sessions"
          value={status?.sessions.total ?? "-"}
          hint={`${status?.sessions.running ?? 0} running / ${status?.sessions.workers ?? 0} subagents`}
        />
        <Stat
          label="Tokens today"
          value={fmtNum((status?.tokens_today.tokens_in ?? 0) + (status?.tokens_today.tokens_out ?? 0))}
          hint={`${fmtNum(status?.tokens_today.tokens_in)} in / ${fmtNum(status?.tokens_today.tokens_out)} out`}
        />
        <Stat label="Model calls" value={fmtNum(status?.tokens_today.model_calls)} hint="today" />
        <Stat
          label="Jobs"
          value={status?.jobs.total ?? "-"}
          hint={`${status?.jobs.running ?? 0} running`}
        />
        <Stat label="Memory" value={status?.memory_count ?? "-"} hint="entries" />
        <Stat label="Tools" value={status?.tools.total ?? "-"} hint={`${Object.keys(status?.tools.disabled ?? {}).length} disabled`} />
      </div>

      <div className="grid three-col">
        <Panel title="Activity">
          <Sparkline points={tokenSeries} />
          <div className="muted" style={{ marginTop: 6 }}>
            tokens per minute (from metrics.jsonl)
          </div>
          <table style={{ marginTop: 10 }}>
            <thead>
              <tr>
                <th>Session</th>
                <th>Status</th>
                <th>Context</th>
                <th>Last activity</th>
              </tr>
            </thead>
            <tbody>
              {(snapshot?.sessions ?? []).slice(0, 8).map((session) => (
                <tr key={session.id}>
                  <td>
                    {session.worker ? <Badge tone="purple">subagent</Badge> : <Badge tone="blue">agent</Badge>}{" "}
                    {session.name || session.id.slice(0, 8)}
                  </td>
                  <td>
                    <Badge tone={session.status === "running" ? "green" : ""}>{session.status}</Badge>
                  </td>
                  <td>{fmtNum(session.context_usage)}</td>
                  <td className="muted">{timeAgo(session.last_activity)}</td>
                </tr>
              ))}
              {!snapshot?.sessions.length && (
                <tr>
                  <td colSpan={4} className="muted">
                    no sessions yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Panel>

        <div className="stack">
          <Panel title="Health">
            {health ? (
              <div className="row">
                <Badge tone={health.ready ? "green" : "red"}>
                  {health.ready ? "ready" : String(health.reason || "not ready")}
                </Badge>
                {health.draining ? <Badge tone="yellow">draining</Badge> : null}
                <span className="muted">
                  release {String(health.release_id ?? "-")}
                </span>
              </div>
            ) : (
              <span className="muted">embedded run - no release state</span>
            )}
            {status?.last_deploy_flagged ? (
              <div style={{ marginTop: 8 }}>
                <Badge tone="yellow">last deploy flagged by eval gate</Badge>
              </div>
            ) : null}
            <div className="muted" style={{ marginTop: 8 }}>
              evals pass rate: {evalPass === null ? "-" : `${evalPass}%`} ({evals.length} recent)
            </div>
          </Panel>

          <Panel title="Recent deploys">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Op</th>
                  <th>Result</th>
                </tr>
              </thead>
              <tbody>
                {(snapshot?.deploys ?? []).slice(0, 6).map((deploy, index) => (
                  <tr key={index}>
                    <td className="muted">{timeAgo(deploy.timestamp)}</td>
                    <td>{String(deploy.op ?? "-")}</td>
                    <td>
                      <Badge tone={deploy.ok ? "green" : "red"}>
                        {deploy.ok ? (deploy.flagged ? "flagged" : "ok") : "failed"}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {!snapshot?.deploys.length && (
                  <tr>
                    <td colSpan={3} className="muted">
                      no deploys
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </Panel>
        </div>
      </div>
    </div>
  );
}
