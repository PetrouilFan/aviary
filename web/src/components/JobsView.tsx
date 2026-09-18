import { useEffect, useState } from "react";
import { api } from "../api";
import type { JobRow } from "../types";
import { Badge, Panel, statusTone, timeAgo } from "./ui";

export function JobsView({ jobs }: { jobs: JobRow[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  useEffect(() => {
    if (!selected) {
      setLog([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const data = await api.jobLog(selected, 0, 400);
        if (!cancelled) setLog(data.lines ?? []);
      } catch {
        /* job may have been pruned */
      }
    };
    void load();
    const timer = window.setInterval(load, 2000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [selected]);

  return (
    <div className="grid two-col">
      <Panel title="Jobs" actions={<span className="muted">{jobs.length} total</span>}>
        <table>
          <thead>
            <tr>
              <th>Job</th>
              <th>Kind</th>
              <th>Status</th>
              <th>Started</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr
                key={job.id}
                className="clickable"
                onClick={() => setSelected(job.id === selected ? null : job.id)}
              >
                <td>
                  <div>{job.name || job.id.slice(0, 8)}</div>
                  <div className="muted mono">{(job.command ?? "").slice(0, 60)}</div>
                </td>
                <td>{job.type ?? "shell"}</td>
                <td>
                  <Badge tone={statusTone(job.status)}>{job.status}</Badge>
                  {job.exit_code !== null && job.exit_code !== undefined ? (
                    <span className="muted"> {job.exit_code}</span>
                  ) : null}
                </td>
                <td className="muted">{timeAgo(job.started ?? job.created)}</td>
                <td>
                  {job.status === "running" || job.status === "pending" ? (
                    <button
                      className="danger"
                      onClick={(event) => {
                        event.stopPropagation();
                        void api.kill(job.id).catch(() => undefined);
                      }}
                    >
                      kill
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
            {!jobs.length && (
              <tr>
                <td colSpan={5} className="muted">
                  no jobs
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Panel>

      <Panel title={selected ? `Log: ${selected.slice(0, 8)}` : "Log"}>
        {selected ? (
          <pre className="log">{log.join("") || "empty log"}</pre>
        ) : (
          <span className="muted">Select a job to tail its output.</span>
        )}
      </Panel>
    </div>
  );
}
