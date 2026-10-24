"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { hub } from "../../hub/client";
import type { Board } from "../../hub/types";

const FOLDERS: Record<string, { job: string; example: string }> = {
  "agent-ui": {
    job: "Interface only. Screens, styles, and components.",
    example: "D:\\Documents\\vscode\\trail-sketch\\src",
  },
  "agent-api": {
    job: "Server only. Routes and handlers the page calls.",
    example: "D:\\Documents\\vscode\\trail-sketch\\server",
  },
  "agent-review": {
    job: "The folder just changed. src after a UI task, server after an API task.",
    example: "D:\\Documents\\vscode\\trail-sketch\\src",
  },
};

function folderWarning(path: string): string {
  const trimmed = path.trim().replace(/[\\/]+$/, "");
  const lower = trimmed.toLowerCase();
  if (lower.endsWith("\\trail-sketch") || lower.endsWith("/trail-sketch")) {
    return "This is the project root. Choose src or server.";
  }
  return "";
}

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

  async function chooseModel(provider: string) {
    setMessage("");
    const response = await hub("/api/model", {
      method: "PUT",
      body: JSON.stringify({ provider }),
    });
    if (!response.ok) {
      setMessage("That model was not selected.");
      return;
    }
    await load();
  }

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
        <button
          className={board?.provider === "gemini" ? "" : "ghost"}
          type="button"
          onClick={() => void chooseModel("gemini")}
        >
          Gemini
        </button>
        <button
          className={board?.provider === "ollama" ? "" : "ghost"}
          type="button"
          onClick={() => void chooseModel("ollama")}
        >
          Local {board?.ollama_model || "gemma3:4b"}
        </button>
      </div>
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
              <button className="permit" type="button" onClick={() => void toggle(action, mode)}>
                {auto ? "On" : "Ask"}
              </button>
            </article>
          );
        })}
      </section>
      <form className="card stack" onSubmit={savePaths}>
        <h2>Projects</h2>
        <p className="quiet">
          Each role should get its own folder inside the project. The model only receives the locked files in that folder.
        </p>
        {(board?.agents ?? []).map((agent) => {
          const hint = FOLDERS[agent.agent_id];
          const warning = folderWarning(paths[agent.agent_id] || "");
          return (
            <label className="field" key={agent.agent_id}>
              {agent.name}
              <span className="quiet">{hint?.job}</span>
              <input
                value={paths[agent.agent_id] || ""}
                onChange={(event) =>
                  setPaths((current) => ({ ...current, [agent.agent_id]: event.target.value }))
                }
                placeholder={hint?.example || "D:\\Documents\\vscode\\project\\src"}
              />
              {warning ? <span className="error">{warning}</span> : null}
            </label>
          );
        })}
        <button className="wide" type="submit">Save folders</button>
      </form>
      {message ? <p className="quiet">{message}</p> : null}
      <button className="ghost wide" type="button" onClick={() => void logout()}>Sign out</button>
    </main>
  );
}
