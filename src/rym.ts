import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { paths } from "./paths.js";

const execFileAsync = promisify(execFile);
let resolvedPythonCommand: string | undefined;

export async function lookupRymGenres(artist: string, album: string) {
  const cleanArtist = artist.trim();
  const cleanAlbum = album.trim();
  if (!cleanArtist || !cleanAlbum) throw new Error("artist and album are required");

  const pythonCommand = await getPythonCommand();
  const { stdout, stderr } = await execFileAsync(pythonCommand, [paths.rymLookupScript, cleanArtist, cleanAlbum], {
    cwd: paths.repoRoot,
    timeout: 45000,
    maxBuffer: 1024 * 1024,
  });

  return {
    ...(JSON.parse(stdout) as Record<string, unknown>),
    stderr: stderr.trim() || undefined,
  };
}

async function getPythonCommand() {
  if (resolvedPythonCommand) return resolvedPythonCommand;
  if (process.env.RAMA_PYTHON_COMMAND) {
    resolvedPythonCommand = process.env.RAMA_PYTHON_COMMAND;
    return resolvedPythonCommand;
  }

  for (const candidate of ["python3.14", "python3.12", "python3.11", "python3.10", "python3.9", "python3"]) {
    try {
      const { stdout, stderr } = await execFileAsync(candidate, ["--version"], { timeout: 5000 });
      const version = parsePythonVersion(`${stdout} ${stderr}`);
      if (version.major > 3 || (version.major === 3 && version.minor >= 9)) {
        resolvedPythonCommand = candidate;
        return resolvedPythonCommand;
      }
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error("RYM lookup requires Python 3.9 or newer");
}

function parsePythonVersion(text: string) {
  const match = text.match(/Python\s+(\d+)\.(\d+)/);
  return {
    major: Number(match?.[1] || 0),
    minor: Number(match?.[2] || 0),
  };
}
