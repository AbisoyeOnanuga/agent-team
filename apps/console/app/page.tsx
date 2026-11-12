"use client";

import { FormEvent, useEffect, useState } from "react";
import { hub, hubDetail } from "../hub/client";
import type { AgentCard, Board, TaskCard } from "../hub/types";
import { FilePicker } from "./file-picker";

type PixelKind = "idle" | "work" | "hold" | "dry";

const PIXEL_LABEL: Record<PixelKind, string> = {
  idle: "Ready",
  work: "Working",
  hold: "Needs you",
  dry: "Practice",
};

function agentState(agent: AgentCard, board: Board | null): PixelKind {
  const waiting = board?.pending_approvals.some((gate) => gate.agent_id === agent.agent_id);
  if (waiting) return "hold";
  if (agent.current_task && agent.tool && agent.tool !== "idle") {
    return board?.model_offline ? "dry" : "work";
  }
  return "idle";
}

function PixelState({ state }: { state: PixelKind }) {
  return (
    <div className="pixel-wrap">
      <div className={`pixel state-pulse`} data-state={state} aria-hidden="true">
        {Array.from({ length: 25 }, (_, index) => (
          <i key={index} />
        ))}
      </div>
      <span className="pixel-label">{PIXEL_LABEL[state]}</span>
    </div>
  );
}

function laneBlurb(board: Board | null): string {
  if (!board) return "";
  const plan = board.plan || "free";
  const busy = board.busy_lanes?.length ?? 0;
  const slots = board.scale_slots ?? 2;
  if (plan === "scale") {
    const band = board.scale_band?.label || "Scale";
    const local = board.local_ready ? "local on" : "local off";
    return `${band} · ${busy} of ${slots} jobs running · ${board.scale_cloud || "cloud"} · ${local}`;
  }
  const first = board.provider === "ollama" ? `local ${board.ollama_model}` : "Gemini";
  return `Free · up to 2 jobs · starts with ${first}`;
}

function LaneBoard({
  board,
  busy,
  slots,
}: {
  board: Board | null;
  busy: string[];
  slots: number;
}) {
  const plan = board?.plan || "free";
  const show = Math.min(Math.max(slots, 2), 24);
  const fill = busy.length;
  const pct = Math.round((fill / show) * 100);
  return (
    <section className="lane-board" aria-label="Job capacity">
      <div className="lane-top">
        <span className="eyebrow">{plan === "scale" ? board?.scale_band?.label || "Scale" : "Free"}</span>
        <span className="lane-count">
          <strong>{fill}</strong>/{show}
        </span>
      </div>
      <div className="lane-meter" aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
      </div>
      <div
        className="lane-grid"
        style={{ "--lane-cols": show <= 6 ? show : show <= 12 ? 6 : 8 } as React.CSSProperties}
      >
        {Array.from({ length: show }, (_, index) => {
          const live = index < fill;
          const local = live && String(busy[index] || "").startsWith("ollama");
          return (
            <span
              key={index}
              className={live ? (local ? "lane-cell local" : "lane-cell live") : "lane-cell"}
              title={live ? busy[index] || "busy" : "open"}
            />
          );
        })}
      </div>
    </section>
  );
}

function JobChip({ task, agents }: { task: TaskCard; agents: AgentCard[] }) {
  const name = agents.find((agent) => agent.agent_id === task.assigned_agent)?.name || "Team";
  const tone = task.status === "IN_PROGRESS" ? "run" : task.status === "REVIEW" ? "hold" : "wait";
  return (
    <article className={`job-chip ${tone}`}>
      <span className="job-dot" aria-hidden="true" />
      <div>
        <strong>{task.title}</strong>
        <div className="quiet">
          {name} · {task.status === "IN_PROGRESS" ? "working" : task.status === "REVIEW" ? "needs you" : "queued"}
        </div>
      </div>
    </article>
  );
}

export default function BoardPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [agentId, setAgentId] = useState("agent-ui");
  const [second, setSecond] = useState(false);
  const [title2, setTitle2] = useState("");
  const [prompt2, setPrompt2] = useState("");
  const [agent2, setAgent2] = useState("agent-api");
  const [files, setFiles] = useState<string[]>([]);
  const [files2, setFiles2] = useState<string[]>([]);

  async function load() {
    const response = await hub("/api/board");
    if (!response.ok) return;
    setBoard((await response.json()) as Board);
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(timer);
  }, []);

  async function assign(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (!files.length || (second && !files2.length)) {
      setError("Choose at least one file for each job.");
      return;
    }
    const jobs = [{ title, prompt, agent_id: agentId, files }];
    if (second) {
      if (agent2 === agentId) {
        setError("Pick two different teammates.");
        return;
      }
      jobs.push({ title: title2, prompt: prompt2, agent_id: agent2, files: files2 });
    }
    for (const job of jobs) {
      const response = await hub("/api/tasks", {
        method: "POST",
        body: JSON.stringify(job),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(hubDetail(body, "Could not send that job."));
        return;
      }
    }
    setTitle("");
    setPrompt("");
    setTitle2("");
    setPrompt2("");
    setFiles([]);
    setFiles2([]);
    setSecond(false);
    await load();
  }

  const holds = board?.pending_approvals.length ?? 0;
  const slots = board?.scale_slots ?? 2;
  const busyLanes = board?.busy_lanes ?? [];
  const openTasks = (board?.tasks ?? []).filter((task) =>
    ["TODO", "IN_PROGRESS", "REVIEW"].includes(task.status),
  );

  return (
    <main className="stack">
      <header className="mast">
        <div>
          <p className="eyebrow">Your coding crew</p>
          <h1>Home</h1>
          <p className="quiet">Send a job. Watch them work. Step in when they ask.</p>
        </div>
        <span className={holds ? "pill hold pulse-pill" : "pill"}>{holds} waiting</span>
      </header>
      <LaneBoard board={board} busy={busyLanes} slots={slots} />
      <p className="quiet lane-line">{laneBlurb(board)}</p>
      {board?.cost_hint ? <p className="quiet cost-hint">{board.cost_hint}</p> : null}
      {board?.model_offline ? (
        <p className="banner">No model is ready. In Setup, add a Gemini key or start local Ollama. You can still queue practice jobs.</p>
      ) : null}
      <section className="agent-rail" aria-label="Teammates">
        {(board?.agents ?? []).map((agent) => {
          const state = agentState(agent, board);
          return (
            <article className={`card agent agent-${state}`} key={agent.agent_id}>
              <div>
                <strong>{agent.name}</strong>
                <div className="meta">{agent.role}</div>
                <div className="quiet path-trim">{agent.repo_path || "Set a folder in Setup"}</div>
              </div>
              <PixelState state={state} />
            </article>
          );
        })}
      </section>
      {openTasks.length ? (
        <section className="job-rail" aria-label="Open jobs">
          <p className="eyebrow">Open jobs</p>
          <div className="job-scroll">
            {openTasks.map((task) => (
              <JobChip key={task.id} task={task} agents={board?.agents ?? []} />
            ))}
          </div>
        </section>
      ) : null}
      <form className="card stack" onSubmit={assign}>
        <h2>New job</h2>
        <label className="field">
          Short title
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <label className="field">
          What should change
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} required />
        </label>
        <label className="field">
          Teammate
          <select
            value={agentId}
            onChange={(event) => {
              const next = event.target.value;
              setAgentId(next);
              setFiles([]);
              if (next === agent2) {
                const other = (board?.agents ?? []).find((agent) => agent.agent_id !== next);
                if (other) setAgent2(other.agent_id);
                setFiles2([]);
              }
            }}
          >
            {(board?.agents ?? []).map((agent) => (
              <option key={agent.agent_id} value={agent.agent_id}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>
        <FilePicker key={agentId} agentId={agentId} value={files} onChange={setFiles} />
        <button className="ghost" type="button" onClick={() => setSecond((open) => !open)}>
          {second ? "One job only" : "Add a second job"}
        </button>
        {second ? (
          <>
            <label className="field">
              Second title
              <input value={title2} onChange={(event) => setTitle2(event.target.value)} required />
            </label>
            <label className="field">
              What the second teammate should change
              <textarea value={prompt2} onChange={(event) => setPrompt2(event.target.value)} required />
            </label>
            <label className="field">
              Second teammate
              <select
                value={agent2}
                onChange={(event) => {
                  setAgent2(event.target.value);
                  setFiles2([]);
                }}
              >
                {(board?.agents ?? [])
                  .filter((agent) => agent.agent_id !== agentId)
                  .map((agent) => (
                    <option key={agent.agent_id} value={agent.agent_id}>
                      {agent.name}
                    </option>
                  ))}
              </select>
            </label>
            <FilePicker key={agent2} agentId={agent2} value={files2} onChange={setFiles2} />
          </>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        <button className="wide" type="submit">{second ? "Send both" : "Send job"}</button>
      </form>
    </main>
  );
}
