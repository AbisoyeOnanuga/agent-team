"use client";

import { useEffect, useState } from "react";
import { hub } from "../../hub/client";
import type { ApprovalCard } from "../../hub/types";

export default function GatePage() {
  const [gates, setGates] = useState<ApprovalCard[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [error, setError] = useState("");

  async function load() {
    const response = await hub("/api/approvals");
    if (!response.ok) return;
    const body = (await response.json()) as { approvals: ApprovalCard[] };
    setGates(body.approvals);
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 1500);
    return () => window.clearInterval(timer);
  }, []);

  async function decide(id: string, decision: "proceed" | "revise" | "stop") {
    setError("");
    const response = await hub("/api/approvals", {
      method: "POST",
      body: JSON.stringify({ id, decision, note: notes[id] || "" }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.detail || "The gate did not move.");
      return;
    }
    setNotes((current) => ({ ...current, [id]: "" }));
    await load();
  }

  return (
    <main className="stack">
      <p className="eyebrow">Waiting on you</p>
      <h1>Approve</h1>
      <p className="quiet">
        Each finished role waits here on its own. Approving one does not hold the other.
      </p>
      {gates.length === 0 ? <p className="quiet">Nothing is waiting. Routine work continues on its own.</p> : null}
      {gates.map((gate) => (
        <article className="ticket" key={gate.id}>
          <div className="band">HOLD</div>
          <p className="eyebrow" style={{ color: "var(--hold)" }}>{gate.action_class}</p>
          <h2>{gate.summary}</h2>
          <p>{gate.justification}</p>
          <p><strong>Blast.</strong> {gate.blast_radius}</p>
          {gate.diff_stat ? <pre className="diff">{gate.diff_stat}</pre> : null}
          <p><strong>If you refuse.</strong> {gate.alternative}</p>
          {gate.action_class === "git_push" ? <p>Push stays at the desk.</p> : null}
          <label className="field">
            Revise note
            <textarea
              value={notes[gate.id] || ""}
              onChange={(event) =>
                setNotes((current) => ({ ...current, [gate.id]: event.target.value }))
              }
            />
          </label>
          <div className="actions">
            <button type="button" onClick={() => void decide(gate.id, "proceed")}>Proceed</button>
            <button className="ghost" type="button" onClick={() => void decide(gate.id, "revise")}>Revise</button>
            <button className="stop" type="button" onClick={() => void decide(gate.id, "stop")}>Stop</button>
          </div>
        </article>
      ))}
      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
