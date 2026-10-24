"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { hub, hubBase } from "../../hub/client";
import type { TapeEvent } from "../../hub/types";

const NOISE = [
  "detected dumb terminal",
  "you can skip this check",
  "https://aider.chat",
  "using sane defaults",
  "did you mean one of these",
  "unknown context window",
  "repo-map:",
  "aider v",
  "git repo:",
  "added .aider",
];

type Block = {
  key: string;
  kind: string;
  taskId: string | null;
  text: string;
};

function noisy(message: string): boolean {
  const line = message.trim().toLowerCase();
  return NOISE.some((item) => line.startsWith(item) || line.includes(item));
}

function fold(events: TapeEvent[]): Block[] {
  const blocks: Block[] = [];
  for (const event of events) {
    if (event.kind === "log" && noisy(event.message)) continue;
    const previous = blocks[blocks.length - 1];
    const sameBurst =
      event.kind === "log" &&
      previous?.kind === "log" &&
      previous.taskId === event.task_id;
    if (sameBurst && previous) {
      previous.text = `${previous.text}\n${event.message}`;
      continue;
    }
    blocks.push({
      key: String(event.id),
      kind: event.kind,
      taskId: event.task_id,
      text: event.message,
    });
  }
  return blocks;
}

export default function TapePage() {
  const [events, setEvents] = useState<TapeEvent[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const blocks = useMemo(() => fold(events), [events]);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [blocks]);

  useEffect(() => {
    let after = 0;
    let source: EventSource | null = null;
    let poll = 0;
    let cancelled = false;

    function push(rows: TapeEvent[]) {
      if (cancelled || !rows.length) return;
      setEvents((current) => {
        const ids = new Set(current.map((row) => row.id));
        const fresh = rows.filter((row) => !ids.has(row.id));
        if (!fresh.length) return current;
        after = Math.max(after, ...fresh.map((row) => row.id));
        return [...current, ...fresh].slice(-80);
      });
    }

    async function pull() {
      const response = await hub(`/api/events/recent?after=${after}`);
      if (!response.ok) return;
      const body = (await response.json()) as { events: TapeEvent[] };
      push(body.events);
    }

    async function start() {
      const response = await hub("/api/events/recent?tail=40");
      if (cancelled || !response.ok) return;
      const body = (await response.json()) as { events: TapeEvent[] };
      push(body.events);
      after = body.events.at(-1)?.id ?? after;
      source = new EventSource(`${hubBase()}/api/events?after=${after}`, { withCredentials: true });
      source.onmessage = (message) => {
        push([JSON.parse(message.data) as TapeEvent]);
      };
      source.onerror = () => {
        source?.close();
        if (!poll) poll = window.setInterval(() => void pull(), 2000);
      };
    }

    void start();
    const backup = window.setInterval(() => void pull(), 2000);
    return () => {
      cancelled = true;
      source?.close();
      window.clearInterval(poll);
      window.clearInterval(backup);
    };
  }, []);

  return (
    <main>
      <p className="eyebrow">Live</p>
      <h1>Log</h1>
      <p className="quiet">Newest lines stay at the bottom. One edit stays in one block.</p>
      <div className="tape" ref={scroller}>
        {blocks.length === 0 ? <p className="quiet">Waiting for the first line from the desk.</p> : null}
        {blocks.map((block) => (
          <article className={`line ${block.kind}`} key={block.key}>
            <div className="kind">{block.kind}</div>
            <pre>{block.text}</pre>
          </article>
        ))}
      </div>
    </main>
  );
}
