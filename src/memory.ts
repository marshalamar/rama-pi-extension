import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { paths } from "./paths.js";

export async function ensureMemoryFile() {
  await mkdir(path.dirname(paths.memory), { recursive: true });
  try {
    await readFile(paths.memory, "utf8");
  } catch {
    await writeFile(paths.memory, "# Music Memory\n\n", "utf8");
  }
}

export async function readMemory() {
  await ensureMemoryFile();
  return {
    path: paths.memory,
    content: await readFile(paths.memory, "utf8"),
  };
}

export async function appendMemory(note: string, source?: string) {
  const cleanNote = note.trim().replace(/\s+/g, " ");
  if (!cleanNote) throw new Error("memory note is required");

  await ensureMemoryFile();
  const timestamp = new Date().toISOString();
  const cleanSource = source?.trim() ? ` (${source.trim().replace(/\s+/g, " ")})` : "";
  const line = `- ${timestamp}: ${cleanNote}${cleanSource}`;
  await appendFile(paths.memory, `${line}\n`, "utf8");

  return {
    path: paths.memory,
    line,
  };
}
