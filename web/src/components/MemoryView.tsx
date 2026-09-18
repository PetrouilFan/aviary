import { useEffect, useState } from "react";
import { api } from "../api";
import type { MemoryHit } from "../types";
import { Badge, Panel, timeAgo } from "./ui";

interface MemoryEntry {
  id: string;
  body: string;
  tags: string[];
  importance?: number;
  updated?: string;
  relations?: Record<string, string[]>;
}

interface MemoryRow extends MemoryEntry {
  score?: number;
}

export function MemoryView() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MemoryHit[]>([]);
  const [entries, setEntries] = useState<MemoryEntry[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newBody, setNewBody] = useState("");
  const [newTags, setNewTags] = useState("");

  const loadEntries = async () => {
    try {
      const data = await api.memoryEntries();
      setEntries(data.entries);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    void loadEntries();
  }, []);

  const search = async () => {
    if (!query.trim()) {
      setHits([]);
      return;
    }
    try {
      const data = await api.memorySearch(query, 20);
      setHits(data.hits);
      setError("");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const save = async () => {
    if (!newBody.trim()) return;
    setBusy(true);
    try {
      await api.memorySave(
        newBody,
        newTags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        0.5,
      );
      setNewBody("");
      setNewTags("");
      await loadEntries();
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const forget = async (id: string) => {
    try {
      await api.memoryForget(id);
      await loadEntries();
      setHits((prev) => prev.filter((hit) => hit.id !== id));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const resultRows: MemoryRow[] = hits.length
    ? hits.map((hit) => ({ ...hit, score: hit.score }))
    : entries.map((entry) => ({ ...entry, score: undefined }));

  return (
    <div className="grid two-col">
      <Panel title="Memory" actions={<span className="muted">{entries.length} entries</span>}>
        <div className="row" style={{ marginBottom: 10 }}>
          <input
            style={{ flex: 1 }}
            value={query}
            placeholder="Search memory..."
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void search();
            }}
          />
          <button onClick={() => void search()}>search</button>
          <button
            onClick={() => {
              setQuery("");
              setHits([]);
            }}
          >
            clear
          </button>
        </div>
        {error ? <div className="error">{error}</div> : null}
        <div className="stack">
          {resultRows.map((entry) => (
            <div className="entry" key={entry.id}>
              <div className="head">
                <strong className="mono">{entry.id}</strong>
                {entry.tags.map((tag) => (
                  <Badge key={tag} tone="blue">
                    {tag}
                  </Badge>
                ))}
                {entry.score !== undefined ? (
                  <span className="score">score {entry.score.toFixed(3)}</span>
                ) : null}
                <span className="spacer" />
                <span className="muted" style={{ fontSize: 11 }}>
                  {timeAgo(entry.updated)}
                </span>
                <button className="danger" onClick={() => void forget(entry.id)}>
                  forget
                </button>
              </div>
              <div style={{ whiteSpace: "pre-wrap" }}>{entry.body}</div>
              {Object.keys(entry.relations ?? {}).length ? (
                <div className="muted mono" style={{ marginTop: 6 }}>
                  {JSON.stringify(entry.relations)}
                </div>
              ) : null}
            </div>
          ))}
          {!resultRows.length && <span className="muted">No memory entries yet.</span>}
        </div>
      </Panel>

      <Panel title="Add entry">
        <div className="stack">
          <textarea
            rows={6}
            value={newBody}
            placeholder="Durable fact, decision or preference..."
            onChange={(event) => setNewBody(event.target.value)}
          />
          <input
            value={newTags}
            placeholder="tags, comma separated"
            onChange={(event) => setNewTags(event.target.value)}
          />
          <button className="primary" disabled={busy || !newBody.trim()} onClick={() => void save()}>
            save entry
          </button>
          <span className="muted">
            Entries are written to the shared state store and committed when memory.git is enabled.
          </span>
        </div>
      </Panel>
    </div>
  );
}
