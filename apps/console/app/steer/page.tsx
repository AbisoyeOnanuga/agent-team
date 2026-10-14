"use client";

import { FormEvent, useEffect, useState } from "react";
import { hub } from "../../hub/client";
import type { Board } from "../../hub/types";

export default function SteerPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [agentId, setAgentId] = useState("agent-ui");
  const [note, setNote] = useState("");
  const [sent, setSent] = useState("");

  useEffect(() => {
    void hub("/api/board").then(async (response) => {
      if (!response.ok) return;
      setBoard((await response.json()) as Board);
    });
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const response = await hub("/api/steers", {
      method: "POST",
      body: JSON.stringify({ agent_id: agentId, note }),
    });
    if (!response.ok) {
      setSent("The note did not land.");
      return;
    }
    setSent("Noted. The agent picks it up on the next edit.");
    setNote("");
  }

  return (
    <main>
      <p className="eyebrow">While you walk</p>
      <h1>Steer</h1>
      <form className="card stack" style={{ marginTop: 16 }} onSubmit={onSubmit}>
        <label className="field">
          Agent
          <select value={agentId} onChange={(event) => setAgentId(event.target.value)}>
            {(board?.agents ?? []).map((agent) => (
              <option key={agent.agent_id} value={agent.agent_id}>{agent.name}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Note
          <textarea value={note} onChange={(event) => setNote(event.target.value)} required />
        </label>
        <button className="wide" type="submit">Send</button>
        {sent ? <p className="quiet">{sent}</p> : null}
      </form>
    </main>
  );
}
