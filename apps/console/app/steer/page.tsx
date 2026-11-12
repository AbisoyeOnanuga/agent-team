"use client";

import { FormEvent, useEffect, useState } from "react";
import { hub, hubDetail } from "../../hub/client";
import type { Board } from "../../hub/types";

const MASTERS: Record<string, string> = {
  "agent-ui": "Changes screens and client behavior only. Leaves the server alone.",
  "agent-api": "Changes server routes and data only. Leaves the look alone.",
  "agent-review": "Reads what others changed, then fixes breaks without rewriting their work.",
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
        setError(hubDetail(body, `Could not save ${agent.name}.`));
        return;
      }
    }
    setSent("Saved. Each teammate reads this on every job until you change it.");
  }

  return (
    <main>
      <p className="eyebrow">Standing rules</p>
      <h1>Guide</h1>
      <p className="quiet">
        Extra instructions for each teammate. Useful when you are away from the desk.
      </p>
      <form className="stack" style={{ marginTop: 16 }} onSubmit={onSubmit}>
        {(board?.agents ?? []).map((agent) => (
          <article className="card stack" key={agent.agent_id}>
            <div>
              <strong>{agent.name}</strong>
              <div className="meta">{agent.role}</div>
            </div>
            <p className="quiet">Always on. {MASTERS[agent.agent_id]}</p>
            <label className="field">
              Your extra note
              <textarea
                value={briefs[agent.agent_id] || ""}
                onChange={(event) =>
                  setBriefs((current) => ({ ...current, [agent.agent_id]: event.target.value }))
                }
                placeholder="Example: keep text short, do not restyle the map."
              />
            </label>
          </article>
        ))}
        {error ? <p className="error">{error}</p> : null}
        <button className="wide" type="submit">Save guides</button>
        {sent ? <p className="quiet">{sent}</p> : null}
      </form>
    </main>
  );
}
