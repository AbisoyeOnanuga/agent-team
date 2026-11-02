"use client";

import { useState } from "react";
import { hub } from "../hub/client";

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
      setError(body.detail || "Could not list this folder.");
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
      <span className="quiet">
        Only these files are given to the model and locked for this task. Paths are inside the role&apos;s folder.
      </span>
      {value.length ? (
        <div className="chips">
          {value.map((rel) => (
            <button className="chip" key={rel} type="button" onClick={() => toggle(rel)} aria-label={`Remove ${rel}`}>
              {rel}
            </button>
          ))}
        </div>
      ) : null}
      {!listing ? (
        <button className="ghost" type="button" onClick={() => void open("")}>
          Pick files
        </button>
      ) : (
        <div className="guide">
          <p className="guide-path">{listing.path ? `${listing.root}\\${listing.path.replace(/\//g, "\\")}` : listing.root}</p>
          <div className="guide-actions">
            {listing.parent !== null ? (
              <button className="guide-action" type="button" onClick={() => void open(listing.parent ?? "")}>
                Go up
              </button>
            ) : null}
            <button className="guide-action use" type="button" onClick={() => setListing(null)}>
              Done
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
            {listing.dirs.length + listing.files.length === 0 ? <p className="quiet">This folder is empty.</p> : null}
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
              placeholder="New file, for example Banner.tsx"
            />
            <button className="guide-action" type="button" onClick={addNew}>
              Add
            </button>
          </div>
        </div>
      )}
      {error ? <span className="error">{error}</span> : null}
    </div>
  );
}
