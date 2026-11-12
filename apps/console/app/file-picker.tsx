"use client";

import { useState } from "react";
import { hub, hubDetail } from "../hub/client";

type Listing = {
  root: string;
  path: string;
  parent: string | null;
  dirs: string[];
  files: string[];
};

function join(base: string, name: string) {
  return base ? `${base}/${name}` : name;
}

export function FilePicker({
  agentId,
  value,
  onChange,
}: {
  agentId: string;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState("");
  const [newFile, setNewFile] = useState("");

  async function open(path: string) {
    setError("");
    const query = `?agent_id=${encodeURIComponent(agentId)}&path=${encodeURIComponent(path)}`;
    const response = await hub(`/api/files${query}`);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(hubDetail(body, "Could not open this folder."));
      return;
    }
    setListing(body as Listing);
  }

  function toggle(rel: string) {
    onChange(value.includes(rel) ? value.filter((item) => item !== rel) : [...value, rel]);
  }

  function addNew() {
    const rel = newFile.trim().replace(/\\/g, "/").replace(/^\/+/, "");
    if (!rel || rel.split("/").includes("..")) return;
    const full = listing && !rel.includes("/") ? join(listing.path, rel) : rel;
    if (!value.includes(full)) onChange([...value, full]);
    setNewFile("");
  }

  return (
    <div className="field">
      Files to change
      <span className="quiet">Tap to choose. Only these files are unlocked for this job.</span>
      {value.length ? (
        <div className="chips">
          {value.map((rel) => (
            <button className="chip" key={rel} type="button" onClick={() => toggle(rel)} aria-label={`Remove ${rel}`}>
              {rel}
            </button>
          ))}
        </div>
      ) : null}
      <button className="ghost" type="button" onClick={() => void open(listing?.path || "")}>
        {listing ? "Refresh list" : "Choose files"}
      </button>
      {listing ? (
        <div className="sheet" role="dialog" aria-label="Choose files">
          <div className="sheet-panel">
            <p className="guide-path">
              {listing.path ? `${listing.root}\\${listing.path.replace(/\//g, "\\")}` : listing.root}
            </p>
            <div className="guide-actions">
              {listing.parent !== null ? (
                <button className="guide-action" type="button" onClick={() => void open(listing.parent ?? "")}>
                  Go up
                </button>
              ) : null}
              <button className="guide-action use" type="button" onClick={() => setListing(null)}>
                Done ({value.length})
              </button>
            </div>
            <div className="guide-list">
              {listing.dirs.map((name) => (
                <button
                  className="guide-folder"
                  key={`d-${name}`}
                  type="button"
                  onClick={() => void open(join(listing.path, name))}
                >
                  {name}
                </button>
              ))}
              {listing.files.map((name) => {
                const rel = join(listing.path, name);
                const picked = value.includes(rel);
                return (
                  <button
                    className={picked ? "guide-file picked" : "guide-file"}
                    key={`f-${name}`}
                    type="button"
                    aria-pressed={picked}
                    onClick={() => toggle(rel)}
                  >
                    {name}
                  </button>
                );
              })}
              {listing.dirs.length + listing.files.length === 0 ? <p className="quiet">Empty folder.</p> : null}
            </div>
            <div className="add-row">
              <input
                value={newFile}
                onChange={(event) => setNewFile(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addNew();
                  }
                }}
                placeholder="New file name"
              />
              <button className="guide-action" type="button" onClick={addNew}>
                Add
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {error ? <span className="error">{error}</span> : null}
    </div>
  );
}
