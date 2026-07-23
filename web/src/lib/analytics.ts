// Lightweight first-party analytics + error monitoring.
//
// Events are sent to our own /api/track and /api/monitor endpoints (no third
// party required) and mirrored into a localStorage ring buffer so the in-app
// Insights panel still has data even before the server round-trips. Pageview
// and web-vitals monitoring is handled separately by @vercel/analytics.

export type AnalyticsEvent = {
  name: string;
  props?: Record<string, unknown>;
  ts: number;
  session: string;
};

const LS_KEY = "rs.events";
const SESSION_KEY = "rs.session";
const MAX_LOCAL = 200;

function sessionId(): string {
  if (typeof window === "undefined") return "server";
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function pushLocal(evt: AnalyticsEvent) {
  if (typeof window === "undefined") return;
  try {
    const arr: AnalyticsEvent[] = JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
    arr.push(evt);
    localStorage.setItem(LS_KEY, JSON.stringify(arr.slice(-MAX_LOCAL)));
  } catch {
    /* storage full or blocked — non-fatal */
  }
}

export function localEvents(): AnalyticsEvent[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

/** Fire-and-forget analytics event. Never throws into the caller. */
export function track(name: string, props?: Record<string, unknown>): void {
  const evt: AnalyticsEvent = { name, props, ts: Date.now(), session: sessionId() };
  pushLocal(evt);
  if (typeof window === "undefined") return;
  void fetch("/api/track", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(evt),
    keepalive: true,
  }).catch(() => {});
}

/** Report a handled error to the monitoring endpoint. */
export function logError(error: unknown, context?: Record<string, unknown>): void {
  const payload = {
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    context,
    ts: Date.now(),
    session: sessionId(),
    url: typeof window !== "undefined" ? window.location.pathname : undefined,
  };
  if (typeof window === "undefined") return;
  void fetch("/api/monitor", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => {});
}
