const HUB_DOWN =
  "The desk hub is not running. On the PC, start the API, then refresh this page.";

let hubDown = false;
const listeners = new Set<(down: boolean) => void>();

function setHubDown(down: boolean) {
  if (hubDown === down) return;
  hubDown = down;
  listeners.forEach((listener) => listener(down));
}

export function subscribeHub(listener: (down: boolean) => void) {
  listeners.add(listener);
  listener(hubDown);
  return () => {
    listeners.delete(listener);
  };
}

export function hubBase(): string {
  if (process.env.NEXT_PUBLIC_HUB_URL) return process.env.NEXT_PUBLIC_HUB_URL;
  return "";
}

/** FastAPI may return detail as a string or a list of validation objects. */
export function hubDetail(body: unknown, fallback = "Something went wrong."): string {
  if (!body || typeof body !== "object") return fallback;
  const detail = (body as { detail?: unknown }).detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: unknown }).msg);
        }
        return "";
      })
      .filter(Boolean);
    return parts.join(" · ") || fallback;
  }
  return fallback;
}

export async function hub(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  try {
    const response = await fetch(`${hubBase()}${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
    setHubDown(false);
    if (response.status === 401 && !path.startsWith("/api/session")) {
      window.location.assign("/login");
    }
    return response;
  } catch {
    setHubDown(true);
    return new Response(JSON.stringify({ detail: HUB_DOWN }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }
}
