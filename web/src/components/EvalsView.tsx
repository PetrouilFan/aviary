import { useEffect, useState } from "react";
import { api } from "../api";
import type { EvalResult, EvalTask, Releases } from "../types";
import { Badge, Panel, fmtNum, timeAgo } from "./ui";

export function EvalsView() {
  const [tasks, setTasks] = useState<EvalTask[]>([]);
  const [results, setResults] = useState<EvalResult[]>([]);
  const [releases, setReleases] = useState<Releases | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = async () => {
    try {
      const [taskData, resultData, releaseData] = await Promise.all([
        api.evalTasks(),
        api.evalResults(),
        api.releases(),
      ]);
      setTasks(taskData.tasks);
      setResults(resultData.results);
      setReleases(releaseData as unknown as Releases);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const runEvals = async () => {
    setBusy(true);
    setNotice("");
    try {
      const report = await api.evalRun();
      setNotice(
        `run ${String(report.run_id ?? "")}: ${String(report.passes ?? 0)}/${String(report.total ?? 0)} passed`,
      );
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const revert = async (releaseId?: string) => {
    setBusy(true);
    try {
      const result = await api.revert(releaseId);
      setNotice(JSON.stringify(result));
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const passRate = results.length
    ? Math.round((results.filter((row) => row.pass).length / results.length) * 100)
    : null;

  return (
    <div className="grid two-col">
      <div className="stack">
        <Panel
          title="Evals"
          actions={
            <div className="row">
              <span className="muted">{passRate === null ? "-" : `${passRate}% recent`}</span>
              <button className="primary" disabled={busy} onClick={() => void runEvals()}>
                run held-out set
              </button>
            </div>
          }
        >
          {error ? <div className="error">{error}</div> : null}
          {notice ? <div className="muted" style={{ marginBottom: 8 }}>{notice}</div> : null}
          <h3 style={{ marginTop: 0 }}>Tasks ({tasks.length})</h3>
          <table>
            <thead>
              <tr>
                <th>Task</th>
                <th>Tags</th>
                <th>Checks</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id}>
                  <td>{task.id}</td>
                  <td>
                    {(task.tags ?? []).map((tag) => (
                      <Badge key={tag} tone="blue">
                        {tag}
                      </Badge>
                    ))}
                  </td>
                  <td className="muted">{(task.check ?? []).map((check) => check.type).join(", ")}</td>
                </tr>
              ))}
              {!tasks.length && (
                <tr>
                  <td colSpan={3} className="muted">
                    no eval tasks in shared/evals/
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <h3>Results</h3>
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Task</th>
                <th>Result</th>
                <th>Tokens</th>
                <th>Release</th>
              </tr>
            </thead>
            <tbody>
              {results.slice(0, 25).map((row, index) => (
                <tr key={index}>
                  <td className="muted">{timeAgo(row.timestamp)}</td>
                  <td>{row.task_id}</td>
                  <td>
                    <Badge tone={row.pass ? "green" : "red"}>
                      {row.pass ? "pass" : "fail"}
                    </Badge>{" "}
                    <span className="muted">
                      {row.checks_passed}/{row.checks_total}
                    </span>
                  </td>
                  <td>{fmtNum(row.tokens)}</td>
                  <td className="mono">{row.release_id}</td>
                </tr>
              ))}
              {!results.length && (
                <tr>
                  <td colSpan={5} className="muted">
                    no results yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Panel>
      </div>

      <Panel
        title="Releases"
        actions={<span className="muted">{releases?.current ?? "-"}</span>}
      >
        {!releases?.available && <span className="muted">{releases?.reason ?? "unavailable"}</span>}
        {releases?.available && (
          <table>
            <thead>
              <tr>
                <th>Release</th>
                <th>Live</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(releases.releases ?? []).map((release) => (
                <tr key={release.release_id}>
                  <td className="mono">{release.release_id}</td>
                  <td>
                    {release.current ? <Badge tone="green">current</Badge> : null}
                    {(releases.green ?? []).some((tag) => tag.includes(release.release_id)) ? (
                      <Badge tone="blue">green</Badge>
                    ) : null}
                  </td>
                  <td>
                    {!release.current && (
                      <button disabled={busy} onClick={() => void revert(release.release_id)}>
                        revert
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!(releases.releases ?? []).length && (
                <tr>
                  <td colSpan={3} className="muted">
                    no releases yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
