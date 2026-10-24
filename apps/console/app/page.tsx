"use client";

import { FormEvent, useEffect, useState } from "react";
import { hub } from "../hub/client";
import type { AgentCard, Board } from "../hub/types";

type PixelKind = "idle" | "work" | "hold" | "dry";

const PIXEL_LABEL: Record<PixelKind, string> = {
  idle: "Idle",
  work: "Editing",
  hold: "Waiting",
  dry: "Dry-run",
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
      <div className="pixel" data-state={state} aria-hidden="true">
        {Array.from({ length: 25 }, (_, index) => (
          <i key={index} />
        ))}
      </div>
      <span className="pixel-label">{PIXEL_LABEL[state]}</span>
    </div>
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

  async function load() {
    const response = await hub("/api/board");
    if (!response.ok) return;
    const next = (await response.json()) as Board;
    setBoard(next);
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 2000);
    return () => window.clearInterval(timer);
  }, []);

  async function assign(event: FormEvent) {
    event.preventDefault();
    setError("");
    const jobs = [{ title, prompt, agent_id: agentId }];
    if (second) {
      if (agent2 === agentId) {
        setError("Pick two different roles. A role works one folder at a time.");
        return;
      }
      jobs.push({ title: title2, prompt: prompt2, agent_id: agent2 });
    }
    for (const job of jobs) {
      const response = await hub("/api/tasks", {
        method: "POST",
        body: JSON.stringify({ ...job, files: [] }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.detail || "The task was not queued.");
        return;
      }
    }
    setTitle("");
    setPrompt("");
    setTitle2("");
    setPrompt2("");
    setSecond(false);
    await load();
  }

  const holds = board?.pending_approvals.length ?? 0;

  return (
    <main className="stack">
      <header className="mast">
        <div>
          <p className="eyebrow">Night shift</p>
          <h1>Board</h1>
          <p className="quiet">Who is working, and what you can hand them next.</p>
        </div>
        <span className={holds ? "pill hold" : "pill"}>{holds} hold</span>
      </header>
      {board?.provider ? (
        <p className="quiet">
          First model: {board.provider === "ollama" ? `local ${board.ollama_model}` : "Gemini"}. A second role uses the other model. Switch the first in Access.
        </p>
      ) : null}
      {board?.model_offline ? (
        <p className="banner">Model offline. Cursor&apos;s Grok login does not drive this swarm. Add an xAI API key or Ollama, or keep the dry-run.</p>
      ) : null}
      <section className="stack" aria-label="Agents">
        {(board?.agents ?? []).map((agent) => {
          const state = agentState(agent, board);
          return (
            <article className="card agent" key={agent.agent_id}>
              <div>
                <strong>{agent.name}</strong>
                <div className="meta">{agent.role}</div>
                <div className="quiet">{agent.repo_path || "No project folder yet"}</div>
              </div>
              <PixelState state={state} />
            </article>
          );
        })}
      </section>
      <form className="card stack" onSubmit={assign}>
        <h2>Send a task</h2>
        <label className="field">
          Title
          <input value={title} onChange={(event) => setTitle(event.target.value)} required />
        </label>
        <label className="field">
          What should change
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} required />
        </label>
        <label className="field">
          Agent
          <select
            value={agentId}
            onChange={(event) => {
              const next = event.target.value;
              setAgentId(next);
              if (next === agent2) {
                const other = (board?.agents ?? []).find((agent) => agent.agent_id !== next);
                if (other) setAgent2(other.agent_id);
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
        <button className="ghost" type="button" onClick={() => setSecond((open) => !open)}>
          {second ? "One role only" : "Add a second role"}
        </button>
        {second ? (
          <>
            <label className="field">
              Second title
              <input value={title2} onChange={(event) => setTitle2(event.target.value)} required />
            </label>
            <label className="field">
              What the second role should change
              <textarea value={prompt2} onChange={(event) => setPrompt2(event.target.value)} required />
            </label>
            <label className="field">
              Second agent
              <select value={agent2} onChange={(event) => setAgent2(event.target.value)}>
                {(board?.agents ?? [])
                  .filter((agent) => agent.agent_id !== agentId)
                  .map((agent) => (
                    <option key={agent.agent_id} value={agent.agent_id}>
                      {agent.name}
                    </option>
                  ))}
              </select>
            </label>
          </>
        ) : null}
        {error ? <p className="error">{error}</p> : null}
        <button className="wide" type="submit">{second ? "Queue both" : "Queue it"}</button>
      </form>
    </main>
  );
}
