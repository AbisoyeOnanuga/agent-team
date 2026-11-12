export type AgentCard = {
  agent_id: string;
  name: string;
  role: string;
  repo_path: string | null;
  tool: string;
  last_seen: string | null;
  current_task: string | null;
};

export type TaskCard = {
  id: string;
  title: string;
  status: string;
  assigned_agent: string | null;
  locks: string[];
  prompt: string | null;
};

export type ApprovalCard = {
  id: string;
  task_id: string;
  agent_id: string | null;
  action_class: string;
  summary: string;
  justification: string;
  blast_radius: string;
  alternative: string;
  diff_stat: string;
  status: string;
};

export type TapeEvent = {
  id: number;
  created_at: string;
  agent_id: string | null;
  task_id: string | null;
  kind: string;
  message: string;
};

export type PolicyState = {
  preset: string;
  modes: Record<string, string>;
};

export type ScaleProvider = {
  id: string;
  label: string;
  why: string;
  site: string;
  cost_index?: number;
  throughput?: string;
};

export type ScaleBand = {
  id: string;
  label: string;
  team: number;
  slots: number;
  fit: string;
};

export type CollabLink = {
  from: string;
  to: string;
  kind: string;
  privacy: string;
};

export type Board = {
  agents: AgentCard[];
  tasks: TaskCard[];
  pending_approvals: ApprovalCard[];
  events: TapeEvent[];
  policy: PolicyState;
  model_offline: boolean;
  provider: string;
  ollama_model: string;
  ntfy_enabled: boolean;
  plan?: "free" | "scale";
  privacy?: "local_first" | "balanced" | "cloud_ok";
  privacy_hint?: string;
  team_size?: number;
  team_max?: number;
  slot_max?: number;
  scale_api_rev?: number;
  configured_team_size?: number;
  configured_scale_slots?: number;
  scale_cloud?: string;
  scale_slots?: number;
  scale_band?: ScaleBand | null;
  scale_bands?: ScaleBand[];
  scale_catalog?: ScaleProvider[];
  shape_hint?: string;
  scale_warnings?: string[];
  cost_hint?: string;
  cloud_key_set?: boolean;
  local_ready?: boolean;
  busy_lanes?: string[];
  links?: CollabLink[];
};
