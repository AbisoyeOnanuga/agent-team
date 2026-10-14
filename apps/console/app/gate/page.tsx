"use client";

import { useEffect, useState } from "react";
import { hub } from "../../hub/client";
import type { ApprovalCard } from "../../hub/types";

export default function GatePage() {
  const [gates, setGates] = useState<ApprovalCard[]>([]);
  const [note, setNote] = useState("");
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

  async function decide(decision: "proceed" | "revise" | "stop") {
    const gate = gates[0];
    if (!gate) return;
    setError("");
    const response = await hub("/api/approvals", {
      method: "POST",
      body: JSON.stringify({ id: gate.id, decision, note }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.detail || "The gate did not move.");
      return;
    }
    setNote("");
    await load();
  }

  const gate = gates[0];

  return (
    <main className="stack">
      <p className="eyebrow">Consequential</p>
      <h1>Gate</h1>
      {!gate ? <p className="quiet">Clear board. Routine work is running without you.</p> : null}
      {gate ? (
        <article className="ticket">
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
            <textarea value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <div className="actions">
            <button type="button" onClick={() => void decide("proceed")}>Proceed</button>
            <button className="ghost" type="button" onClick={() => void decide("revise")}>Revise</button>
            <button className="stop" type="button" onClick={() => void decide("stop")}>Stop</button>
          </div>
        </article>
      ) : null}
    </main>
  );
}
