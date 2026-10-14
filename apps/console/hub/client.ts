export function hubBase(): string {
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_HUB_URL || "http://127.0.0.1:8787";
  }
  if (process.env.NEXT_PUBLIC_HUB_URL) return process.env.NEXT_PUBLIC_HUB_URL;
  return `http://${window.location.hostname}:8787`;
}

export async function hub(path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await fetch(`${hubBase()}${path}`, {
    ...init,
    headers,
    credentials: "include",
  });
  if (response.status === 401 && !path.startsWith("/api/session")) {
    window.location.assign("/login");
  }
  return response;
}
