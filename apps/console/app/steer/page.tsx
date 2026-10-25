"use client";

import { FormEvent, useEffect, useState } from "react";
import { hub } from "../../hub/client";
import type { Board } from "../../hub/types";

const MASTERS: Record<string, string> = {
  "agent-ui":
    "Interface worker. Change layout, copy, and client behavior only. Leave the server, the database, and secrets alone.",
  "agent-api":
    "Services worker. Change handlers, routes, and data access only. Do not restyle the interface or touch secrets.",
  "agent-review":
    "Review worker. Read what the others already changed, then fix breaks. Do not widen the task or rewrite their work.",
};

export default function SteerPage() {
  const [board, setBoard] = useState<Board | null>(null);
  const [briefs, setBriefs] = useState<Record<string, string>>({});
  const [sent, setSent] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    void hub("/api/board").then(async (response) => {
      if (!response.ok) return;
      setBoard((await response.json()) as Board);
    });
    void hub("/api/briefs").then(async (response) => {
      if (!response.ok) return;
      const body = (await response.json()) as { briefs: Record<string, string> };
      setBriefs(body.briefs);
    });
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSent("");
    for (const agent of board?.agents ?? []) {
      const response = await hub("/api/briefs", {
        method: "PUT",
        body: JSON.stringify({ agent_id: agent.agent_id, brief: briefs[agent.agent_id] || "" }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setError(body.detail || `Could not save ${agent.name}.`);
        return;
      }
    }
    setSent("Saved. Each role reads its extra prompt on every task until you change it here.");
  }

  return (
    <main>
      <p className="eyebrow">Each role</p>
      <h1>Prompts</h1>
      <p className="quiet">
        Add a standing prompt for each role from the phone. It is added after that role&apos;s built-in brief, and it stays until you edit it.
      </p>
      <form className="stack" style={{ marginTop: 16 }} onSubmit={onSubmit}>
        {(board?.agents ?? []).map((agent) => (
          <article className="card stack" key={agent.agent_id}>
            <div>
              <strong>{agent.name}</strong>
              <div className="meta">{agent.role}</div>
            </div>
            <p className="quiet">Built in. {MASTERS[agent.agent_id]}</p>
            <label className="field">
              Extra prompt
              <textarea
                value={briefs[agent.agent_id] || ""}
                onChange={(event) =>
                  setBriefs((current) => ({ ...current, [agent.agent_id]: event.target.value }))
                }
                placeholder="Example: keep copy short, and do not restyle the map."
              />
            </label>
          </article>
        ))}
        {error ? <p className="error">{error}</p> : null}
        <button className="wide" type="submit">Save prompts</button>
        {sent ? <p className="quiet">{sent}</p> : null}
      </form>
    </main>
  );
}
