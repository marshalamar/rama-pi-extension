import { existsSync, watch, type FSWatcher } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { paths } from "./paths.js";
import { snapshotStatus } from "./listening.js";
import { parsePlistXml, resolveKeyedArchive } from "./plist.js";

const execFileAsync = promisify(execFile);

type ListeningEntry = {
  songId: number | null;
  name: string;
  artists: string[];
  artistText: string;
  album: string;
  durationMs: number | null;
  playedTime: number | null;
  startlogtime: unknown;
  playType: unknown;
};

let watcher: FSWatcher | undefined;
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let currentSnapshot: ListeningEntry[] = [];
let lastError: string | undefined;
let startedAt: string | undefined;
let lastReadAt: string | undefined;
let loggedEvents = 0;

export async function watcherStatus() {
  const snapshot = await snapshotStatus();

  return {
    state: watcher ? "running" : existsSync(paths.ncmHistory) ? "stopped" : "needs-permission",
    running: Boolean(watcher),
    history: paths.ncmHistory,
    snapshot,
    events: paths.playEvents,
    log: paths.watcherLog,
    startedAt,
    lastReadAt,
    loggedEvents,
    lastError,
  };
}

export async function startWatcher() {
  if (watcher) return watcherStatus();
  if (!existsSync(paths.ncmHistory)) return watcherStatus();

  await mkdir(path.dirname(paths.snapshot), { recursive: true });
  currentSnapshot = await loadSnapshot();
  await readAndPersistHistory();

  startedAt = new Date().toISOString();
  watcher = watch(paths.ncmHistory, { persistent: true }, scheduleRead);
  return watcherStatus();
}

export async function stopWatcher() {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = undefined;
  }
  watcher?.close();
  watcher = undefined;

  return watcherStatus();
}

function scheduleRead() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void readAndPersistHistory().catch((error) => {
      lastError = error instanceof Error ? error.message : String(error);
    });
  }, 500);
}

async function readHistory() {
  const { stdout } = await execFileAsync("plutil", ["-convert", "xml1", "-o", "-", paths.ncmHistory], {
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 8 * 1024 * 1024,
  });
  const plist = parsePlistXml(stdout);
  const archive = resolveKeyedArchive(plist);
  const items = typeof archive === "string" ? JSON.parse(archive) : archive;
  if (!Array.isArray(items)) throw new Error("Netease history archive is not an array");

  return items.map(normalizeHistoryItem);
}

function normalizeHistoryItem(item: unknown): ListeningEntry {
  const record = asRecord(item);
  const track = asRecord(record.track);
  const artists = Array.isArray(track.artists)
    ? track.artists.map((artist) => asRecord(artist).name).filter((name): name is string => typeof name === "string")
    : [];
  const albumRecord = asRecord(track.album);
  const alRecord = asRecord(track.al);

  return {
    songId: Number(track.id) || null,
    name: typeof track.name === "string" ? track.name : "未知歌曲",
    artists,
    artistText: artists.join(" / ") || "未知歌手",
    album: typeof albumRecord.name === "string" ? albumRecord.name : typeof alRecord.name === "string" ? alRecord.name : "未知专辑",
    durationMs: Number(track.duration) || null,
    playedTime: typeof record.playedTime === "number" ? record.playedTime : null,
    startlogtime: record.startlogtime ?? null,
    playType: record.playType ?? null,
  };
}

async function readAndPersistHistory() {
  const previous = currentSnapshot;
  const next = await readHistory();
  const count = await diffAndLog(previous, next);

  currentSnapshot = next;
  lastReadAt = new Date().toISOString();
  lastError = undefined;
  loggedEvents += count;
  await writeFile(paths.snapshot, JSON.stringify(next), "utf8");
}

async function loadSnapshot() {
  try {
    return JSON.parse(await readFile(paths.snapshot, "utf8")) as ListeningEntry[];
  } catch {
    return [];
  }
}

async function diffAndLog(prev: ListeningEntry[], curr: ListeningEntry[]) {
  const now = new Date().toISOString();
  const prevMap = new Map<string, ListeningEntry>();

  for (const entry of prev) {
    if (entry.songId && entry.startlogtime) {
      prevMap.set(`${entry.songId}_${entry.startlogtime}`, entry);
    }
  }

  const events: Array<Record<string, unknown>> = [];

  for (const entry of curr) {
    if (!entry.songId) continue;

    const key = `${entry.songId}_${entry.startlogtime}`;
    const old = prevMap.get(key);

    if (!old) {
      events.push({ type: "play_start", ts: now, ...entry });
    } else if (old.playedTime !== entry.playedTime) {
      events.push({ type: "play_update", ts: now, prevPlayedTime: old.playedTime, ...entry });
    }
  }

  if (events.length > 0) {
    await appendFile(paths.playEvents, events.map((event) => JSON.stringify(event)).join("\n") + "\n", "utf8");
  }

  return events.length;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
