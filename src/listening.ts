import { readFile, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { paths } from "./paths.js";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : {};
}

function extractItems(snapshot: unknown): unknown[] {
  if (Array.isArray(snapshot)) return snapshot;
  const record = asRecord(snapshot);
  for (const key of ["items", "tracks", "songs", "recent", "history", "playEvents", "events"]) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return [];
}

export async function readSnapshotRaw() {
  const content = await readFile(paths.snapshot, "utf8");
  const stats = await stat(paths.snapshot);
  return {
    path: paths.snapshot,
    mtimeMs: stats.mtimeMs,
    hash: createHash("sha256").update(content).digest("hex"),
    json: JSON.parse(content) as unknown,
  };
}

export async function snapshotStatus() {
  try {
    const snapshot = await readSnapshotRaw();
    return {
      state: "ready",
      path: snapshot.path,
      mtimeMs: snapshot.mtimeMs,
      hash: snapshot.hash,
      itemCount: extractItems(snapshot.json).length,
    };
  } catch (error) {
    return {
      state: "missing",
      path: paths.snapshot,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function readRecentListening(limit: number) {
  const boundedLimit = Math.max(1, Math.min(50, Math.floor(limit)));
  const snapshot = await readSnapshotRaw();
  const items = extractItems(snapshot.json).slice(0, boundedLimit);
  return {
    path: snapshot.path,
    mtimeMs: snapshot.mtimeMs,
    hash: snapshot.hash,
    itemCount: extractItems(snapshot.json).length,
    items,
    raw: items.length > 0 ? undefined : snapshot.json,
  };
}
