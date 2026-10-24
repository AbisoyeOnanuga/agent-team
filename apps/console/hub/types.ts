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
};
