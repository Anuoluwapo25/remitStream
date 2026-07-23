// Server-side append-only store for analytics events, error reports, and
// feedback. Backed by newline-delimited JSON files under .data/.
//
// This is deliberately simple: an MVP-grade store that persists on any host
// with a writable filesystem. For a horizontally-scaled deployment, swap the
// read/append helpers for a hosted KV or Postgres — the call sites don't change.

import { promises as fs } from "fs";
import path from "path";

const DATA_DIR = process.env.RS_DATA_DIR ?? path.join(process.cwd(), ".data");

export type StoreName = "events" | "errors" | "feedback";

function fileFor(name: StoreName): string {
  return path.join(DATA_DIR, `${name}.ndjson`);
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function append(name: StoreName, record: unknown): Promise<void> {
  await ensureDir();
  await fs.appendFile(fileFor(name), JSON.stringify(record) + "\n", "utf8");
}

export async function readAll<T = unknown>(name: StoreName): Promise<T[]> {
  try {
    const raw = await fs.readFile(fileFor(name), "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as T;
        } catch {
          return null;
        }
      })
      .filter((x): x is T => x !== null);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
}
