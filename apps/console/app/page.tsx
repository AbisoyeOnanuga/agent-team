"use client";

import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { hub, hubDetail } from "../hub/client";
import type { AgentCard, Board, CollabLink, TaskCard } from "../hub/types";
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
      <div className="pixel state-pulse" data-state={state} aria-hidden="true">
        {Array.from({ length: 25 }, (_, index) => (
          <i key={index} />
        ))}
      </div>
      <span className="pixel-label">{PIXEL_LABEL[state]}</span>
    </div>
  );
}

function statusLine(board: Board | null): string {
  if (!board) return "";
  const jobs = board.busy_lanes?.length ?? 0;
  const slots = board.scale_slots ?? 2;
  const team = board.team_size ?? board.agents.length;
  if (board.plan === "scale") {
    return `${board.scale_band?.label || "Scale"} · ${team} teammates · ${jobs}/${slots} jobs · ${board.scale_cloud || "cloud"}`;
  }
  const first = board.provider === "ollama" ? `local ${board.ollama_model}` : "Gemini";
  return `Free · ${team} teammates · ${jobs}/2 jobs · ${first}`;
}

type Point = { x: number; y: number };

function layoutAgents(agents: AgentCard[], width: number, height: number) {
  const core = agents.filter((agent) => !agent.agent_id.startsWith("agent-swarm-"));
  const swarm = agents.filter((agent) => agent.agent_id.startsWith("agent-swarm-"));
  const points: Record<string, Point> = {};
  const pad = 36;
  const coreY = swarm.length ? height * 0.28 : height * 0.5;
  const swarmY = height * 0.78;

  core.forEach((agent, index) => {
    const span = Math.max(core.length - 1, 1);
    const x = pad + ((width - pad * 2) * index) / span;
    points[agent.agent_id] = { x: core.length === 1 ? width / 2 : x, y: coreY };
  });

  swarm.forEach((agent, index) => {
    const span = Math.max(swarm.length - 1, 1);
    const x = pad + ((width - pad * 2) * index) / span;
    points[agent.agent_id] = { x: swarm.length === 1 ? width / 2 : x, y: swarmY };
  });

  return {
    points,
    share: { x: width / 2, y: swarm.length ? height * 0.52 : height * 0.78 },
    hasSwarm: swarm.length > 0,
  };
}

function wirePath(a: Point, b: Point, bend: number) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * bend;
  const ny = (dx / len) * bend;
  return `M ${a.x} ${a.y} Q ${mx + nx} ${my + ny} ${b.x} ${b.y}`;
}

function SwarmMap({
  agents,
  links,
  board,
}: {
  agents: AgentCard[];
  links: CollabLink[];
  board: Board | null;
}) {
  const width = 340;
  const height = 300;
  const { points, share, hasSwarm } = layoutAgents(agents, width, height);
  const working = agents.filter((agent) => agentState(agent, board) === "work").length;
  const liveCount = links.filter((link) => link.live).length;

  return (
    <section className="compute-unit swarm-map" aria-label="Team compute unit">
      <div className="unit-head">
        <span className="eyebrow">Team unit</span>
        <span className="unit-readout">
          <i className={working ? "led on" : "led"} />
          {agents.length} cores · {working} lit
          {liveCount ? ` · ${liveCount} live` : ""}
        </span>
      </div>
      <p className="quiet map-blurb">
        Main team is UI ↔ API ↔ Review. Extra swarm cores assist one of those roles.
        SHARE is the shared note file (`.hackswarm/shared.md`), not a model. Dots move only when a job is running.
      </p>
      <svg viewBox={`0 0 ${width} ${height}`} className="swarm-svg" role="img">
        <title>Teammate communication map</title>
        <circle className="unit-core" cx={share.x} cy={share.y} r="22" />
        <circle className={`unit-core-ring${liveCount ? " live" : ""}`} cx={share.x} cy={share.y} r="30" />
        <text className="unit-core-label" x={share.x} y={share.y + 4} textAnchor="middle">
          SHARE
        </text>
        {links.map((link, linkIndex) => {
          const a = points[link.from];
          const b = points[link.to];
          if (!a || !b) return null;
          const bend =
            link.kind === "team" ? -28 - linkIndex * 4
            : link.kind === "handoff" ? 26 + linkIndex * 3
            : link.kind === "assist" ? (linkIndex % 2 === 0 ? 18 : -18)
            : 12;
          const d = wirePath(a, b, bend);
          return (
            <g key={`${link.from}-${link.to}-${link.kind}`}>
              <path className={`swarm-link ${link.kind} ${link.privacy}${link.live ? " live" : ""}`} d={d} />
              {link.live ? (
                <circle className={`electron ${link.kind}`} r="2.6">
                  <animateMotion dur={`${1.4 + (linkIndex % 3) * 0.25}s`} repeatCount="indefinite" path={d} />
                </circle>
              ) : null}
            </g>
          );
        })}
        {agents.map((agent) => {
          const point = points[agent.agent_id];
          if (!point) return null;
          const state = agentState(agent, board);
          const swarm = agent.agent_id.startsWith("agent-swarm-");
          return (
            <g
              key={agent.agent_id}
              className={`swarm-node ${state}${swarm ? " swarm" : " core"}`}
              transform={`translate(${point.x} ${point.y})`}
            >
              <circle className="node-glow" r="22" />
              <circle className="node-body" r={swarm ? 14 : 17} />
              <circle className="node-led" cx="10" cy="-10" r="2.5" />
              <text textAnchor="middle" dy="4">
                {agent.name.slice(0, 7)}
              </text>
            </g>
          );
        })}
        {hasSwarm ? (
          <text className="row-label" x={16} y={height * 0.14}>
            Main team
          </text>
        ) : null}
        {hasSwarm ? (
          <text className="row-label" x={16} y={height * 0.64}>
            Swarm cores
          </text>
        ) : null}
      </svg>
      <div className="swarm-legend quiet">
        <span className="leg team">Team wire</span>
        <span className="leg handoff">Review handoff</span>
        <span className="leg assist">Swarm assist</span>
        <span className="leg active">Live job</span>
      </div>
    </section>
  );
}

function LaneBoard({ busy, slots }: { busy: string[]; slots: number }) {
  const show = Math.min(Math.max(slots, 2), 24);
  const fill = busy.length;
  const pct = Math.round((fill / show) * 100);
  return (
    <section className="compute-unit lane-board" aria-label="Job rack">
      <div className="lane-top">
        <span className="eyebrow">Job rack</span>
        <span className="lane-count">
          <i className={fill ? "led on blink" : "led"} />
          <strong>{fill}</strong>/{show} slots
        </span>
      </div>
      <div className="lane-meter" aria-hidden="true">
        <i style={{ width: `${pct}%` }} />
        {fill ? <span className="electron-sweep" /> : null}
      </div>
      <div
        className="lane-grid"
        style={{ "--lane-cols": show <= 6 ? show : show <= 12 ? 6 : 8 } as CSSProperties}
      >
        {Array.from({ length: show }, (_, index) => {
          const live = index < fill;
          const local = live && String(busy[index] || "").startsWith("ollama");
          return (
            <span
              key={index}
              className={live ? (local ? "lane-cell local" : "lane-cell live") : "lane-cell"}
              style={{ animationDelay: `${(index % 8) * 0.08}s` }}
            >
              <i className="slot-led" />
            </span>
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
    const next = (await response.json()) as Board;
    setBoard(next);
    if (!next.agents.some((agent) => agent.agent_id === agentId) && next.agents[0]) {
      setAgentId(next.agents[0].agent_id);
    }
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
  const agents = board?.agents ?? [];
  const openTasks = (board?.tasks ?? []).filter((task) =>
    ["TODO", "IN_PROGRESS", "REVIEW"].includes(task.status),
  );

  return (
    <main className="stack">
      <header className="mast">
        <div>
          <p className="eyebrow">Your coding crew</p>
          <h1>Home</h1>
          <p className="quiet">The crew is a compute unit: cores talk, jobs light up, privacy stays on this PC.</p>
        </div>
        <span className={holds ? "pill hold pulse-pill" : "pill"}>{holds} waiting</span>
      </header>

      <SwarmMap agents={agents} links={board?.links ?? []} board={board} />
      <LaneBoard busy={busyLanes} slots={slots} />
      <p className="quiet lane-line">{statusLine(board)}</p>
      {board?.shape_hint ? <p className="quiet cost-hint">{board.shape_hint}</p> : null}
      {board?.cost_hint ? <p className="quiet cost-hint">{board.cost_hint}</p> : null}
      {(board?.scale_warnings ?? []).map((note) => (
        <p className="banner" key={note}>{note}</p>
      ))}
      {board?.privacy_hint ? <p className="quiet">{board.privacy_hint}</p> : null}
      {board?.model_offline ? (
        <p className="banner">No model is ready. In Setup, add a cloud key or start local Ollama.</p>
      ) : null}

      <section className="agent-rail" aria-label="Teammates">
        {agents.map((agent) => {
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
              <JobChip key={task.id} task={task} agents={agents} />
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
                const other = agents.find((agent) => agent.agent_id !== next);
                if (other) setAgent2(other.agent_id);
                setFiles2([]);
              }
            }}
          >
            {agents.map((agent) => (
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
                {agents
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
