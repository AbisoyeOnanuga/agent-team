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

const CORE_ORDER = ["agent-ui", "agent-api", "agent-review"] as const;
const ANCHOR_OF: Record<string, string> = {
  "agent-swarm-1": "agent-ui",
  "agent-swarm-2": "agent-api",
  "agent-swarm-3": "agent-review",
  "agent-swarm-4": "agent-review",
  "agent-swarm-5": "agent-ui",
  "agent-swarm-6": "agent-api",
  "agent-swarm-7": "agent-ui",
  "agent-swarm-8": "agent-api",
  "agent-swarm-9": "agent-review",
};

function layoutAgents(agents: AgentCard[], width: number, height: number) {
  const byId = Object.fromEntries(agents.map((agent) => [agent.agent_id, agent]));
  const core = CORE_ORDER.map((id) => byId[id]).filter(Boolean) as AgentCard[];
  const swarm = agents.filter((agent) => agent.agent_id.startsWith("agent-swarm-"));
  const points: Record<string, Point> = {};
  const pad = 40;
  const coreY = swarm.length ? 70 : height / 2;
  const colXs = CORE_ORDER.map((_, index) => {
    const span = Math.max(CORE_ORDER.length - 1, 1);
    return pad + ((width - pad * 2) * index) / span;
  });
  const colX: Record<string, number> = {
    "agent-ui": colXs[0],
    "agent-api": colXs[1],
    "agent-review": colXs[2],
  };

  core.forEach((agent) => {
    points[agent.agent_id] = { x: colX[agent.agent_id], y: coreY };
  });

  const columns: Record<string, AgentCard[]> = {
    "agent-ui": [],
    "agent-api": [],
    "agent-review": [],
  };
  swarm.forEach((agent) => {
    const anchor = ANCHOR_OF[agent.agent_id] || "agent-ui";
    columns[anchor].push(agent);
  });

  const swarmTop = coreY + 110;
  const rowGap = 52;
  (Object.keys(columns) as Array<keyof typeof columns>).forEach((anchor) => {
    columns[anchor].forEach((agent, row) => {
      const count = columns[anchor].length;
      const xSpread = count > 1 ? (row - (count - 1) / 2) * 22 : 0;
      points[agent.agent_id] = {
        x: colX[anchor] + xSpread,
        y: swarmTop + row * rowGap,
      };
    });
  });

  const bottom = Math.max(
    coreY + 40,
    ...Object.values(points).map((point) => point.y + 36),
  );

  return { points, hasSwarm: swarm.length > 0, height: Math.max(height, bottom), coreY, colX };
}

/** Straight orthogonal path with rounded corners — no diagonal chaos. */
function roundedOrtho(points: Point[], radius = 10): string {
  if (points.length < 2) return "";
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const len1 = Math.hypot(v1x, v1y) || 1;
    const len2 = Math.hypot(v2x, v2y) || 1;
    const r = Math.min(radius, len1 / 2, len2 / 2);
    const p1 = { x: curr.x - (v1x / len1) * r, y: curr.y - (v1y / len1) * r };
    const p2 = { x: curr.x + (v2x / len2) * r, y: curr.y + (v2y / len2) * r };
    d += ` L ${p1.x} ${p1.y} Q ${curr.x} ${curr.y} ${p2.x} ${p2.y}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x} ${last.y}`;
  return d;
}

function routeLink(
  link: CollabLink,
  points: Record<string, Point>,
  coreY: number,
): string | null {
  const a = points[link.from];
  const b = points[link.to];
  if (!a || !b) return null;
  const top = a.y <= b.y ? a : b;
  const bottom = a.y <= b.y ? b : a;

  if (link.kind === "team") {
    // Adjacent core rail just under the nodes.
    const y = coreY + 28;
    return roundedOrtho([
      { x: a.x, y: a.y + 18 },
      { x: a.x, y },
      { x: b.x, y },
      { x: b.x, y: b.y + 18 },
    ]);
  }

  if (link.kind === "handoff") {
    const ids = [link.from, link.to];
    const longSpan = ids.includes("agent-ui") && ids.includes("agent-review");
    // UI–Review uses a lower rail; API–Review shares the team rail height.
    const y = coreY + (longSpan ? 46 : 28);
    return roundedOrtho([
      { x: a.x, y: a.y + 18 },
      { x: a.x, y },
      { x: b.x, y },
      { x: b.x, y: b.y + 18 },
    ]);
  }

  if (link.kind === "assist") {
    // Column trunk: up from swarm, then short stub if x differs — no shared diagonals.
    if (Math.abs(a.x - b.x) < 1) {
      return roundedOrtho([
        { x: bottom.x, y: bottom.y - 16 },
        { x: top.x, y: top.y + 18 },
      ]);
    }
    // Join below the core rails so assist trunks never cross team/review wires.
    const joinY = coreY + 64;
    return roundedOrtho([
      { x: bottom.x, y: bottom.y - 16 },
      { x: bottom.x, y: joinY },
      { x: top.x, y: joinY },
      { x: top.x, y: top.y + 18 },
    ]);
  }

  // Shared-folder wires stay on a quiet mid rail.
  const y = Math.max(a.y, b.y) - 30;
  return roundedOrtho([
    { x: a.x, y: a.y - 16 },
    { x: a.x, y },
    { x: b.x, y },
    { x: b.x, y: b.y - 16 },
  ]);
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
  const { points, hasSwarm, height, coreY } = layoutAgents(agents, width, 280);
  const working = agents.filter((agent) => agentState(agent, board) === "work").length;
  const wires = links.filter((link) => link.kind === "team" || link.kind === "handoff" || link.kind === "assist");
  const liveCount = wires.filter((link) => link.live).length;

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
        UI ↔ API ↔ Review stay on clear rails. Swarm cores sit under the role they assist.
        Moving dots appear only on a live job path.
      </p>
      <svg viewBox={`0 0 ${width} ${height}`} className="swarm-svg" role="img">
        <title>Teammate communication map</title>
        {wires.map((link, linkIndex) => {
          const d = routeLink(link, points, coreY);
          if (!d) return null;
          return (
            <g key={`${link.from}-${link.to}-${link.kind}`}>
              <path className={`swarm-link ${link.kind}${link.live ? " live" : ""}`} d={d} />
              {link.live ? (
                <circle className={`electron ${link.kind}`} r="2.6">
                  <animateMotion dur={`${1.35 + (linkIndex % 3) * 0.2}s`} repeatCount="indefinite" path={d} />
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
          <text className="row-label" x={14} y={28}>
            Main team
          </text>
        ) : null}
        {hasSwarm ? (
          <text className="row-label" x={14} y={coreY + 88}>
            Swarm cores
          </text>
        ) : null}
      </svg>
      <div className="swarm-legend quiet">
        <span className="leg team">Team rail</span>
        <span className="leg handoff">Review rail</span>
        <span className="leg assist">Assist trunk</span>
        <span className="leg active">Live flow</span>
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
