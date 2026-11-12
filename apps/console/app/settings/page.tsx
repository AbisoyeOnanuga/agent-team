"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { hub, hubDetail } from "../../hub/client";
import type { Board } from "../../hub/types";

const FOLDERS: Record<string, { job: string }> = {
  "agent-ui": { job: "Screens and buttons." },
  "agent-api": { job: "Server and data." },
  "agent-review": { job: "Check what just changed." },
};

const TOGGLES = [
  ["git_commit", "Save a local commit"],
  ["delete_files", "Delete chosen files"],
  ["install_deps", "Install packages"],
] as const;

const PRIVACY = [
  ["local_first", "Private first"],
  ["balanced", "Share the load"],
  ["cloud_ok", "Cloud first"],
] as const;

export default function SettingsPage() {
  const router = useRouter();
  const [board, setBoard] = useState<Board | null>(null);
  const [paths, setPaths] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [toastOk, setToastOk] = useState(true);
  const [browseId, setBrowseId] = useState("");
  const [listing, setListing] = useState<{ path: string; parent: string; dirs: string[] } | null>(null);
  const [browseError, setBrowseError] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [slots, setSlots] = useState(4);
  const [teamSize, setTeamSize] = useState(3);

  function flash(text: string, ok = true) {
    setToastOk(ok);
    setMessage(text);
  }

  async function load() {
    const response = await hub("/api/board");
    if (!response.ok) return;
    const next = (await response.json()) as Board;
    setBoard(next);
    setPaths(Object.fromEntries(next.agents.map((agent) => [agent.agent_id, agent.repo_path || ""])));
    setSlots(next.scale_slots || 4);
    setTeamSize(next.team_size || 3);
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(""), 4200);
    return () => window.clearTimeout(timer);
  }, [message]);

  async function putPlan(body: Record<string, unknown>) {
    setMessage("");
    const response = await hub("/api/plan", { method: "PUT", body: JSON.stringify(body) });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      flash(hubDetail(data, "Could not save that setting."), false);
      return;
    }
    setApiKey("");
    await load();
    if (body.scale_slots != null || body.team_size != null) {
      flash(`Saved · ${body.team_size ?? teamSize} teammates · ${body.scale_slots ?? slots} jobs`);
    } else {
      flash("Saved");
    }
  }

  async function chooseModel(provider: string) {
    setMessage("");
    const response = await hub("/api/model", { method: "PUT", body: JSON.stringify({ provider }) });
    if (!response.ok) {
      flash("Could not switch the Free model.", false);
      return;
    }
    await load();
    flash("Model updated");
  }

  async function preset(name: string) {
    setMessage("");
    const response = await hub("/api/policy", { method: "PUT", body: JSON.stringify({ preset: name }) });
    if (!response.ok) {
      flash("Could not save that safety level.", false);
      return;
    }
    await load();
    flash(`Safety · ${name}`);
  }

  async function toggle(action: string, mode: string) {
    const next = mode === "approve_before" ? "act_and_notify" : "approve_before";
    const response = await hub("/api/policy", {
      method: "PUT",
      body: JSON.stringify({ action_class: action, mode: next }),
    });
    if (!response.ok) {
      flash("Push and secret files stay locked.", false);
      return;
    }
    await load();
    flash("Permission updated");
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
        flash(hubDetail(body, "Could not save a folder."), false);
        return;
      }
    }
    await load();
    flash("Folders saved");
  }

  async function loadDirs(path: string) {
    setBrowseError("");
    const query = path ? `?path=${encodeURIComponent(path)}` : "";
    const response = await hub(`/api/folders${query}`);
    if (!response.ok) {
      if (path) {
        await loadDirs("");
        return;
      }
      const body = await response.json().catch(() => ({}));
      setBrowseError(hubDetail(body, "Could not open that folder."));
      return;
    }
    setListing((await response.json()) as { path: string; parent: string; dirs: string[] });
  }

  async function openBrowse(agentId: string) {
    setBrowseId(agentId);
    await loadDirs(paths[agentId] || "");
  }

  function useFolder() {
    if (!browseId || !listing) return;
    setPaths((current) => ({ ...current, [browseId]: listing.path }));
    setBrowseId("");
    setListing(null);
  }

  async function logout() {
    await hub("/api/session/logout", { method: "POST" });
    router.push("/login");
  }

  const modes = board?.policy.modes ?? {};
  const plan = board?.plan || "free";
  const cloud = board?.scale_catalog?.find((item) => item.id === board.scale_cloud);

  return (
    <main className="stack">
      {message ? (
        <div className={toastOk ? "toast ok" : "toast bad"} role="status">
          {message}
        </div>
      ) : null}
      <p className="eyebrow">Your computer</p>
      <h1>Setup</h1>
      <p className="quiet">
        Free is 3 teammates and 2 jobs at once. Scale lets you add teammates and open more jobs on a key you already pay for.
        Keys never leave this PC.
      </p>
      {board?.cost_hint ? <p className="quiet">{board.cost_hint}</p> : null}

      <section className="card stack">
        <h2>Plan</h2>
        <div className="actions">
          <button className={plan === "free" ? "" : "ghost"} type="button" onClick={() => void putPlan({ plan: "free" })}>
            Free
          </button>
          <button className={plan === "scale" ? "" : "ghost"} type="button" onClick={() => void putPlan({ plan: "scale" })}>
            Scale
          </button>
        </div>
        <p className="quiet">
          {plan === "scale"
            ? "Add teammates and parallel jobs. One cloud account. Local model still covers private work."
            : "Everyday: Gemini + local Ollama. Lowest spend."}
        </p>
      </section>

      <section className="card stack">
        <h2>Privacy</h2>
        <div className="actions">
          {PRIVACY.map(([id, label]) => (
            <button
              key={id}
              className={board?.privacy === id ? "" : "ghost"}
              type="button"
              onClick={() => void putPlan({ privacy: id })}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="quiet">{board?.privacy_hint}</p>
      </section>

      {plan === "free" ? (
        <section className="card stack">
          <h2>Free brains</h2>
          <div className="actions">
            <button className={board?.provider === "gemini" ? "" : "ghost"} type="button" onClick={() => void chooseModel("gemini")}>
              Gemini
            </button>
            <button className={board?.provider === "ollama" ? "" : "ghost"} type="button" onClick={() => void chooseModel("ollama")}>
              Local {board?.ollama_model || "gemma3:4b"}
            </button>
          </div>
        </section>
      ) : (
        <section className="card stack">
          <h2>Cloud account</h2>
          <p className="quiet">
            Pick one hub with enough rate limits for your width. OpenRouter, Together, and Fireworks are built for many jobs at once.
          </p>
          <div className="provider-grid">
            {(board?.scale_catalog ?? []).map((item) => (
              <button
                key={item.id}
                className={board?.scale_cloud === item.id ? "provider picked" : "provider"}
                type="button"
                onClick={() => void putPlan({ scale_cloud: item.id })}
              >
                <strong>{item.label}</strong>
                <span>{item.why}</span>
              </button>
            ))}
          </div>
          {cloud ? (
            <p className="quiet">
              Key from <a href={cloud.site} target="_blank" rel="noreferrer">{cloud.site.replace(/^https?:\/\//, "")}</a>
              {board?.cloud_key_set ? " · saved here" : " · not saved yet"}
            </p>
          ) : null}
          <label className="field">
            API key
            <input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={board?.cloud_key_set ? "•••••••• (blank keeps current)" : "Paste from your account"}
            />
          </label>
          <h3 style={{ margin: 0, fontSize: 18 }}>Scale shape</h3>
          <div className="actions">
            {(board?.scale_bands ?? []).map((band) => (
              <button
                key={band.id}
                className={board?.scale_band?.id === band.id ? "" : "ghost"}
                type="button"
                onClick={() => {
                  setTeamSize(band.team);
                  setSlots(band.slots);
                }}
              >
                {band.label}
              </button>
            ))}
          </div>
          <p className="quiet">
            {(board?.scale_bands ?? []).find((band) => band.id === board?.scale_band?.id)?.fit
              || "Team = core three. Swarm = more teammates. Project = widest jobs. More is not always better."}
          </p>
          <label className="field">
            Teammates · {teamSize}
            <input
              type="range"
              min={3}
              max={9}
              step={1}
              value={teamSize}
              onChange={(event) => setTeamSize(Number(event.target.value))}
            />
          </label>
          <label className="field">
            Jobs at once · {slots}
            <input
              type="range"
              min={2}
              max={24}
              step={1}
              value={slots}
              onChange={(event) => setSlots(Number(event.target.value))}
            />
          </label>
          <button
            className="wide"
            type="button"
            onClick={() =>
              void putPlan({
                plan: "scale",
                team_size: teamSize,
                scale_slots: slots,
                ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
              })
            }
          >
            Save Scale · {teamSize} teammates · {slots} jobs
          </button>
          {message && toastOk ? <p className="quiet save-echo">{message}</p> : null}
          {message && !toastOk ? <p className="error save-echo">{message}</p> : null}
        </section>
      )}

      <section className="card stack">
        <h2>Safety</h2>
        <p className="quiet">
          Level: {board?.policy.preset || "…"}. Push never runs from the phone.
          {board?.ntfy_enabled ? " Phone buzz is on." : ""}
        </p>
        <div className="actions">
          {[
            ["watch", "Watch"],
            ["routine", "Ask me"],
            ["open", "Go ahead"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={board?.policy.preset === id ? "" : "ghost"}
              type="button"
              onClick={() => void preset(id)}
            >
              {label}
            </button>
          ))}
        </div>
        {TOGGLES.map(([action, label]) => {
          const mode = modes[action] || "approve_before";
          const auto = mode === "act_and_notify" || mode === "act_and_log";
          return (
            <article className="card agent" key={action}>
              <div>
                <strong style={{ fontSize: 18 }}>{label}</strong>
                <div className="quiet">{auto ? "Runs, then tells you" : "Waits for your OK"}</div>
              </div>
              <button className="permit" type="button" onClick={() => void toggle(action, mode)}>
                {auto ? "On" : "Ask"}
              </button>
            </article>
          );
        })}
      </section>

      <form className="card stack" onSubmit={savePaths}>
        <h2>Folders</h2>
        <p className="quiet">Tap Browse. Walk the folders with your thumb. Avoid typing long paths on the phone.</p>
        {(board?.agents ?? []).map((agent) => {
          const hint = FOLDERS[agent.agent_id];
          return (
            <div className="folder-row" key={agent.agent_id}>
              <div>
                <strong>{agent.name}</strong>
                <div className="quiet">{hint?.job || "Parallel work in its own folder."}</div>
                <p className="path-chip">{paths[agent.agent_id] || "No folder yet"}</p>
              </div>
              <button className="ghost" type="button" onClick={() => void openBrowse(agent.agent_id)}>
                Browse
              </button>
            </div>
          );
        })}
        <button className="wide" type="submit">Save folders</button>
      </form>

      {browseId && listing ? (
        <div className="sheet" role="dialog" aria-label="Choose folder">
          <div className="sheet-panel">
            <p className="eyebrow">
              Folder for {board?.agents.find((agent) => agent.agent_id === browseId)?.name || "teammate"}
            </p>
            <p className="guide-path">{listing.path}</p>
            <div className="guide-actions">
              {listing.parent ? (
                <button className="guide-action" type="button" onClick={() => void loadDirs(listing.parent)}>
                  Go up
                </button>
              ) : null}
              <button className="guide-action use" type="button" onClick={useFolder}>
                Use this folder
              </button>
              <button className="guide-action" type="button" onClick={() => { setBrowseId(""); setListing(null); }}>
                Cancel
              </button>
            </div>
            <div className="guide-list">
              {listing.dirs.length === 0 ? <p className="quiet">No folders here.</p> : null}
              {listing.dirs.map((name) => (
                <button
                  className="guide-folder"
                  key={name}
                  type="button"
                  onClick={() => void loadDirs(`${listing.path}\\${name}`)}
                >
                  {name}
                </button>
              ))}
            </div>
            {browseError ? <p className="error">{browseError}</p> : null}
          </div>
        </div>
      ) : null}

      <button className="ghost wide" type="button" onClick={() => void logout()}>Sign out</button>
    </main>
  );
}
