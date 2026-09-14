"use client";

// A purely local, per-browser list of circle ids this device has created or
// joined. There is no on-chain index of "circles a given address belongs
// to" (that would mean iterating every circle ever created), so this is a
// convenience bookmark, not a source of truth — the chain always is. Losing
// it just means re-entering an id or link, never losing funds.

const KEY = "rs.circles.mine";

export function bookmarkedCircleIds(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function bookmarkCircle(id: string): void {
  try {
    const ids = bookmarkedCircleIds();
    if (!ids.includes(id)) {
      localStorage.setItem(KEY, JSON.stringify([id, ...ids].slice(0, 50)));
    }
  } catch {
    /* storage blocked — the circle still works, it just won't be listed here */
  }
}
