import type { ReactNode } from "react";

export function Panel({
  title,
  actions,
  children,
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="panel">
      <h3>
        {title}
        <span className="spacer" />
        {actions}
      </h3>
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="panel stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {hint ? <div className="hint">{hint}</div> : null}
    </div>
  );
}

type Tone = "green" | "yellow" | "red" | "blue" | "purple" | "";

export function Badge({ tone = "", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}

export function statusTone(status?: string): Tone {
  switch (status) {
    case "running":
      return "green";
    case "done":
      return "blue";
    case "pending":
      return "yellow";
    case "failed":
    case "killed":
    case "aborted":
    case "error":
      return "red";
    default:
      return "";
  }
}

export function timeAgo(ts?: number | string | null): string {
  if (!ts) return "-";
  const value = typeof ts === "number" ? ts * 1000 : Date.parse(ts);
  if (Number.isNaN(value)) return String(ts);
  const seconds = Math.max(0, (Date.now() - value) / 1000);
  if (seconds < 60) return `${Math.floor(seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function fmtNum(value: number | undefined | null): string {
  if (value === undefined || value === null) return "-";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

export function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}...` : id;
}

export function Sparkline({
  points,
  color = "var(--accent)",
}: {
  points: number[];
  color?: string;
}) {
  if (points.length < 2) return <div className="muted">not enough data yet</div>;
  const width = 600;
  const height = 48;
  const max = Math.max(...points, 1);
  const step = width / (points.length - 1);
  const path = points
    .map((value, index) => `${index === 0 ? "M" : "L"}${index * step},${height - (value / max) * height}`)
    .join(" ");
  const area = `${path} L${width},${height} L0,${height} Z`;
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <path d={area} fill={color} opacity={0.12} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.6} />
    </svg>
  );
}
