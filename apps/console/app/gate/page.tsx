"use client";

import { useEffect, useState } from "react";
import { hub, hubDetail } from "../../hub/client";
import type { ApprovalCard } from "../../hub/types";

const ACTION_LABEL: Record<string, string> = {
  git_commit: "Save commit",
  delete_files: "Delete files",
  install_deps: "Install packages",
  mark_done: "Mark finished",
  edit_locked_files: "Edit files",
  run_tests: "Run tests",
};

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
      setError(hubDetail(body, "That choice did not go through."));
      return;
    }
    setNotes((current) => ({ ...current, [id]: "" }));
    await load();
  }

  return (
    <main className="stack">
      <p className="eyebrow">Your call</p>
      <h1>Review</h1>
      <p className="quiet">They pause here before a commit, delete, or install. Approving one does not hold the others.</p>
      {gates.length === 0 ? <p className="quiet">Nothing waiting. Keep working from Home.</p> : null}
      {gates.map((gate) => (
        <article className="ticket" key={gate.id}>
          <div className="band">PAUSE</div>
          <p className="eyebrow" style={{ color: "var(--hold)" }}>
            {ACTION_LABEL[gate.action_class] || gate.action_class}
          </p>
          <h2>{gate.summary}</h2>
          <p>{gate.justification}</p>
          <p><strong>What it touches.</strong> {gate.blast_radius}</p>
          {gate.diff_stat ? <pre className="diff">{gate.diff_stat}</pre> : null}
          <p><strong>If you say no.</strong> {gate.alternative}</p>
          {gate.action_class === "git_push" ? <p>Uploading to the internet stays on your PC.</p> : null}
          <label className="field">
            Change request
            <textarea
              value={notes[gate.id] || ""}
              onChange={(event) =>
                setNotes((current) => ({ ...current, [gate.id]: event.target.value }))
              }
              placeholder="Tell them what to fix"
            />
          </label>
          <div className="actions">
            <button type="button" onClick={() => void decide(gate.id, "proceed")}>Looks good</button>
            <button className="ghost" type="button" onClick={() => void decide(gate.id, "revise")}>Change it</button>
            <button className="stop" type="button" onClick={() => void decide(gate.id, "stop")}>Stop</button>
          </div>
        </article>
      ))}
      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}
