export interface AgentInfo {
  agent_id: string;
  release_id: string;
  commit_sha: string;
  state_path: string;
  root: string | null;
  ephemeral: boolean;
  self_modify: boolean;
  worker: boolean;
  session_id: string | null;
  tools: number;
  disabled_tools: Record<string, string[]>;
  models: Record<string, ModelRole>;
  last_total_tokens: number;
}

export interface ModelRole {
  provider?: string;
  model?: string;
  context_length?: number;
}

export interface TokensToday {
  tokens_in: number;
  tokens_out: number;
  model_calls: number;
}

export interface Status {
  agent: AgentInfo;
  tokens_today: TokensToday;
  memory_count: number;
  sessions: { total: number; workers: number; running: number };
  jobs: { total: number; running: number };
  tools: { total: number; disabled: Record<string, string[]> };
  health: Record<string, unknown> | null;
  releases: Releases | null;
  last_deploy_flagged: boolean;
  version: string;
}

export interface Releases {
  available?: boolean;
  reason?: string;
  current?: string | null;
  running_release?: string | null;
  green?: string[];
  releases?: { release_id: string; current: boolean; mtime: number }[];
}

export interface SessionRow {
  id: string;
  name: string;
  agent_id: string;
  status: string;
  last_activity: number;
  context_usage: number;
  visible_to: string;
  worker: boolean;
  parent_session: string | null;
  branch_point: number | null;
}

export interface Message {
  role: string;
  content: string | null;
  id?: string;
  ts?: number;
  tool_calls?: { id: string; name: string; arguments: string }[];
  tool_call_id?: string;
  name?: string;
  from_agent?: string;
}

export interface JobRow {
  id: string;
  name?: string | null;
  type?: string;
  command?: string;
  status: string;
  exit_code?: number | null;
  created?: string | null;
  started?: string | null;
  finished?: string | null;
  log_path?: string;
  session_id?: string | null;
  agent_id?: string;
  timeout_s?: number | null;
}

export interface EvalResult {
  timestamp?: string;
  run_id?: string;
  release_id?: string;
  task_id?: string;
  pass?: boolean;
  checks_passed?: number;
  checks_total?: number;
  latency_ms?: number;
  tokens?: number;
  model_role?: string;
  agent_id?: string;
}

export interface MetricRow {
  timestamp?: string;
  tokens_in?: number;
  tokens_out?: number;
  model_calls?: number;
  session_id?: string;
  duration_ms?: number;
  [key: string]: unknown;
}

export interface DeployRow {
  timestamp?: string;
  op?: string;
  ok?: boolean;
  release_id?: string | null;
  motivation?: string | null;
  error?: string | null;
  flagged?: boolean;
  duration_ms?: number;
  [key: string]: unknown;
}

export interface Snapshot {
  type: string;
  ts: number;
  status: Status;
  sessions: SessionRow[];
  jobs: JobRow[];
  evals: EvalResult[];
  deploys: DeployRow[];
  metrics: MetricRow[];
}

export interface MemoryHit {
  id: string;
  score: number;
  tags: string[];
  body: string;
  relations?: Record<string, string[]>;
}

export interface EvalTask {
  id: string;
  prompt: string;
  tags?: string[];
  timeout_s?: number;
  model?: string | null;
  check?: { type: string; value?: string; path?: string }[];
}
