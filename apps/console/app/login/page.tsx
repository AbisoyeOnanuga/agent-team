"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { hub } from "../../hub/client";

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const response = await hub("/api/session", {
      method: "POST",
      body: JSON.stringify({ pin }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.detail || "The hub refused that PIN.");
      return;
    }
    router.push("/");
  }

  return (
    <main className="login">
      <form className="card stack" onSubmit={onSubmit}>
        <p className="eyebrow">Field radio</p>
        <h1>Dispatch</h1>
        <p className="quiet">The agents keep working on the desk machine. This PIN opens the board.</p>
        <label className="field">
          PIN
          <input
            inputMode="numeric"
            autoComplete="current-password"
            value={pin}
            onChange={(event) => setPin(event.target.value)}
            required
            minLength={4}
          />
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button className="wide" type="submit">Open the board</button>
      </form>
    </main>
  );
}
