"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { hub } from "../../hub/client";
import type { Board } from "../../hub/types";

const TOGGLES = [
  ["git_commit", "Commit"],
  ["delete_files", "Delete locked files"],
  ["install_deps", "Install dependencies"],
] as const;

export default function SettingsPage() {
  const router = useRouter();
  const [board, setBoard] = useState<Board | null>(null);
  const [paths, setPaths] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  async function load() {
    const response = await hub("/api/board");
    if (!response.ok) return;
    const next = (await response.json()) as Board;
    setBoard(next);
    setPaths(
      Object.fromEntries(next.agents.map((agent) => [agent.agent_id, agent.repo_path || ""])),
    );
  }

  useEffect(() => {
    void load();
  }, []);

  async function preset(name: string) {
    setMessage("");
    const response = await hub("/api/policy", {
      method: "PUT",
      body: JSON.stringify({ preset: name }),
    });
    if (!response.ok) {
      setMessage("That level was not saved.");
      return;
    }
    await load();
  }

  async function toggle(action: string, mode: string) {
    const next = mode === "approve_before" ? "act_and_notify" : "approve_before";
    const response = await hub("/api/policy", {
      method: "PUT",
      body: JSON.stringify({ action_class: action, mode: next }),
    });
    if (!response.ok) {
      setMessage("Push, secrets, and files outside the lock stay off.");
      return;
    }
    await load();
  }

  async function savePaths(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    for (const [agentId, repoPath] of Object.entries(paths)) {
      if (!repoPath.trim()) continue;
      const response = await hub("/api/projects", {
        method: "PUT",
        body: JSON.stringify({ agent_id: agentId, repo_path: repoPath.trim() }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setMessage(body.detail || `Could not save ${agentId}.`);
        return;
      }
    }
    setMessage("Project folders saved.");
    await load();
  }

  async function logout() {
    await hub("/api/session/logout", { method: "POST" });
    router.push("/login");
  }

  const modes = board?.policy.modes ?? {};

  return (
    <main className="stack">
      <p className="eyebrow">Allowance</p>
      <h1>Access</h1>
      <p className="quiet">
        Current level: {board?.policy.preset || "…"}. Push and secret files never run from the phone.
        {board?.ntfy_enabled ? " A phone buzz is configured." : " No buzz topic is set."}
      </p>
      <div className="actions">
        {["watch", "routine", "open"].map((name) => (
          <button
            key={name}
            className={board?.policy.preset === name ? "" : "ghost"}
            type="button"
            onClick={() => void preset(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <section className="stack">
        {TOGGLES.map(([action, label]) => {
          const mode = modes[action] || "approve_before";
          const auto = mode === "act_and_notify" || mode === "act_and_log";
          return (
            <article className="card agent" key={action}>
              <div>
                <strong style={{ fontSize: 18 }}>{label}</strong>
                <div className="quiet">{auto ? "Runs, and you are told" : "Waits for Proceed"}</div>
              </div>
              <button type="button" onClick={() => void toggle(action, mode)}>
                {auto ? "On" : "Ask"}
              </button>
            </article>
          );
        })}
      </section>
      <form className="card stack" onSubmit={savePaths}>
        <h2>Projects</h2>
        {(board?.agents ?? []).map((agent) => (
          <label className="field" key={agent.agent_id}>
            {agent.name}
            <input
              value={paths[agent.agent_id] || ""}
              onChange={(event) =>
                setPaths((current) => ({ ...current, [agent.agent_id]: event.target.value }))
              }
              placeholder="D:\Documents\vscode\project"
            />
          </label>
        ))}
        <button className="wide" type="submit">Save folders</button>
      </form>
      {message ? <p className="quiet">{message}</p> : null}
      <button className="ghost wide" type="button" onClick={() => void logout()}>Sign out</button>
    </main>
  );
}
