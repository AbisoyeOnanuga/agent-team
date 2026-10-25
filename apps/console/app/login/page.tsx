"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { hub } from "../../hub/client";

export default function LoginPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [showPin, setShowPin] = useState(false);
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
      <form className="card stack" method="post" onSubmit={onSubmit}>
        <p className="eyebrow">Sign in</p>
        <h1>Agent team</h1>
        <p className="quiet">This PIN opens the team on this computer.</p>
        <label className="field">
          PIN
          <span className="pin-row">
            <input
              key={showPin ? "pin-shown" : "pin-masked"}
              name="pin"
              type={showPin ? "text" : "password"}
              inputMode="numeric"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={pin}
              onChange={(event) => setPin(event.target.value)}
              required
              minLength={4}
            />
            <button type="button" className="ghost" onClick={() => setShowPin((current) => !current)}>
              {showPin ? "Hide" : "Show"}
            </button>
          </span>
        </label>
        {error ? <p className="error">{error}</p> : null}
        <button className="wide" type="submit">Open the board</button>
      </form>
    </main>
  );
}
