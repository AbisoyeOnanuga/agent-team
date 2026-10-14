"use client";

import { useEffect, useState } from "react";
import { hub, hubBase } from "../../hub/client";
import type { TapeEvent } from "../../hub/types";

export default function TapePage() {
  const [events, setEvents] = useState<TapeEvent[]>([]);

  useEffect(() => {
    let after = 0;
    let source: EventSource | null = null;
    let poll = 0;
    const seen = new Set<number>();

    function push(rows: TapeEvent[]) {
      const fresh = rows.filter((row) => !seen.has(row.id));
      fresh.forEach((row) => seen.add(row.id));
      if (!fresh.length) return;
      after = fresh[fresh.length - 1].id;
      setEvents((current) => [...current, ...fresh].slice(-80));
    }

    async function pull() {
      const response = await hub(`/api/events/recent?after=${after}`);
      if (!response.ok) return;
      const body = (await response.json()) as { events: TapeEvent[] };
      push(body.events);
    }

    void pull();
    try {
      source = new EventSource(`${hubBase()}/api/events?after=0`, { withCredentials: true });
      source.onmessage = (message) => {
        push([JSON.parse(message.data) as TapeEvent]);
      };
      source.onerror = () => {
        source?.close();
        poll = window.setInterval(() => void pull(), 2000);
      };
    } catch {
      poll = window.setInterval(() => void pull(), 2000);
    }
    const backup = window.setInterval(() => void pull(), 4000);
    return () => {
      source?.close();
      window.clearInterval(poll);
      window.clearInterval(backup);
    };
  }, []);

  return (
    <main>
      <p className="eyebrow">Live</p>
      <h1>Log</h1>
      <p className="quiet">Each line is something an agent just did.</p>
      <div className="tape" style={{ marginTop: 16 }}>
        {events.length === 0 ? <p className="quiet">Waiting for the first line from the desk.</p> : null}
        {events.map((event) => (
          <article className={`line ${event.kind}`} key={event.id}>
            <div className="kind">{event.kind}</div>
            <div>{event.message}</div>
          </article>
        ))}
      </div>
    </main>
  );
}
