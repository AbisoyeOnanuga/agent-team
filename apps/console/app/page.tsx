"use client";

import { FormEvent, useEffect, useState } from "react";
import { hub } from "../hub/client";
import type { Board } from "../hub/types";

export default function BoardPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [error, setError] = useState("");
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [agentId, setAgentId] = useState("agent-ui");

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
    const response = await hub("/api/tasks", {
      method: "POST",
      body: JSON.stringify({ title, prompt, agent_id: agentId, files: [] }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.detail || "The task was not queued.");
      return;
    }
    setTitle("");
    setPrompt("");
    await load();
  }

  const holds = board?.pending_approvals.length ?? 0;

  return (
    <main className="stack">
      <header className="mast">
        <div>
          <p className="eyebrow">Night shift</p>
          <h1>Board</h1>
        </div>
        <span className={holds ? "pill hold" : "pill"}>{holds} hold</span>
      </header>
      {board?.model_offline ? (
        <p className="banner">Model offline. Edits inside the lock are local dry-runs until a key or Ollama is set.</p>
      ) : null}
      <section className="stack" aria-label="Agents">
        {(board?.agents ?? []).map((agent) => (
          <article className="card agent" key={agent.agent_id}>
            <div>
              <strong>{agent.name}</strong>
              <div className="meta">{agent.role}</div>
              <div className="quiet">{agent.repo_path || "No project folder yet"}</div>
            </div>
            <span className="pill">{agent.tool || "idle"}</span>
          </article>
        ))}
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
          <select value={agentId} onChange={(event) => setAgentId(event.target.value)}>
            {(board?.agents ?? []).map((agent) => (
              <option key={agent.agent_id} value={agent.agent_id}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button className="wide" type="submit">Queue it</button>
      </form>
    </main>
  );
}
