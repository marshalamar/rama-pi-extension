import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = path.resolve(extensionRoot, "..");
const projectRoot = path.resolve(repoRoot, "..");

function firstExisting(candidates: string[], fallback: string): string {
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return fallback;
}

export const paths = {
  extensionRoot,
  repoRoot,
  projectRoot,
  memory:
    process.env.RAMA_MUSIC_MEMORY ||
    firstExisting(
      [path.join(projectRoot, "music-memory.md"), path.join(repoRoot, "data", "memory.md")],
      path.join(os.homedir(), ".rama", "music-memory.md"),
    ),
  snapshot:
    process.env.RAMA_NCM_SNAPSHOT ||
    path.join(process.env.NCM_WATCHER_DATA_DIR || path.join(os.homedir(), ".ncm-watcher"), "last-snapshot.json"),
  playEvents:
    process.env.RAMA_NCM_EVENTS ||
    path.join(process.env.NCM_WATCHER_DATA_DIR || path.join(os.homedir(), ".ncm-watcher"), "play-events.jsonl"),
  watcherLog:
    path.join(process.env.NCM_WATCHER_DATA_DIR || path.join(os.homedir(), ".ncm-watcher"), "watcher.log"),
  ncmHistory:
    process.env.RAMA_NCM_HISTORY ||
    path.join(
      os.homedir(),
      "Library/Containers/com.netease.163music/Data/Documents/storage/file_storage/webdata/file/history",
    ),
  rymLookupScript:
    process.env.RAMA_RYM_LOOKUP_SCRIPT ||
    path.join(repoRoot, "vendor", "rym-genre-lookup", "scripts", "lookup.py"),
};
