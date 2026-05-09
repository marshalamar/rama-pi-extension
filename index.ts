import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "typebox";
import { appendMemory, ensureMemoryFile, readMemory } from "./src/memory.js";
import { readRecentListening, snapshotStatus } from "./src/listening.js";
import { lookupRymGenres } from "./src/rym.js";
import { createScheduler } from "./src/scheduler.js";
import { startWatcher, stopWatcher, watcherStatus } from "./src/watcher.js";

export default function ramaPiExtension(pi: ExtensionAPI) {
  const scheduler = createScheduler(pi);

  pi.registerTool({
    name: "rama_recent_listening",
    label: "RAMA Recent Listening",
    description: "Read the raw recent Netease listening snapshot. Use this before discussing what the user has been playing recently.",
    promptSnippet: "Read the user's recent Netease listening data from the local watcher snapshot.",
    promptGuidelines: [
      "Use this tool when the user asks about recent listening or when a proactive music check-in needs fresh context.",
      "Treat the snapshot as raw evidence. Do not over-summarize or invent missing data.",
    ],
    parameters: Type.Object({
      limit: Type.Optional(Type.Number({ minimum: 1, maximum: 50, description: "Maximum items to return" })),
    }),
    async execute(_toolCallId, params) {
      const result = await readRecentListening(params.limit ?? 20);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "rama_read_memory",
    label: "RAMA Read Memory",
    description: "Read the RAMA music memory file.",
    promptSnippet: "Read the user's durable RAMA music memory.",
    promptGuidelines: ["Use this before answering preference-sensitive music questions."],
    parameters: Type.Object({}),
    async execute() {
      const result = await readMemory();
      return {
        content: [{ type: "text", text: result.content || "(empty memory)" }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "rama_write_memory",
    label: "RAMA Write Memory",
    description: "Append a concise memory note when the user clearly states a music preference or feedback.",
    promptSnippet: "Append a short durable RAMA memory note.",
    promptGuidelines: [
      "Only write facts the user clearly expressed.",
      "Keep the note short and concrete.",
      "Do not store ordinary greetings.",
    ],
    parameters: Type.Object({
      note: Type.String({ minLength: 1, description: "Short memory note to append" }),
      source: Type.Optional(Type.String({ description: "Why this was recorded" })),
    }),
    async execute(_toolCallId, params) {
      const result = await appendMemory(params.note, params.source);
      return {
        content: [{ type: "text", text: `Memory updated: ${result.line}` }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "rym_genre_lookup",
    label: "RYM Genre Lookup",
    description: "Look up Rate Your Music genre tags for a specific album using search engine snippets.",
    promptSnippet: "Look up RYM genre tags for a specific artist and album.",
    promptGuidelines: [
      "Use this when album genre/style context materially improves the music answer.",
      "Do not call it on every turn.",
      "If it returns no genres, answer without pretending RYM data exists.",
    ],
    parameters: Type.Object({
      artist: Type.String({ description: "Artist name, for example Frank Ocean" }),
      album: Type.String({ description: "Album title, for example Blonde" }),
    }),
    async execute(_toolCallId, params) {
      const result = await lookupRymGenres(params.artist, params.album);
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "rama_watcher_status",
    label: "RAMA Watcher Status",
    description: "Check whether the in-session RAMA Netease watcher is running and can read local Netease history.",
    parameters: Type.Object({}),
    async execute() {
      const result = await watcherStatus();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "rama_start_watcher",
    label: "RAMA Start Watcher",
    description: "Start RAMA's in-session Netease watcher.",
    parameters: Type.Object({}),
    async execute() {
      const result = await startWatcher();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  });

  pi.registerTool({
    name: "rama_stop_watcher",
    label: "RAMA Stop Watcher",
    description: "Stop RAMA's in-session Netease watcher.",
    parameters: Type.Object({}),
    async execute() {
      const result = await stopWatcher();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        details: result,
      };
    },
  });

  pi.registerCommand("rama-status", {
    description: "Show RAMA extension status",
    handler: async (_args, ctx) => {
      const [snapshot, watcher, memory] = await Promise.all([snapshotStatus(), watcherStatus(), readMemory()]);
      ctx.ui.notify(
        `RAMA | scheduler: ${scheduler.isRunning() ? "running" : "stopped"} | snapshot: ${snapshot.state} | watcher: ${watcher.state} | memory: ${memory.path}`,
        "info",
      );
    },
  });

  pi.registerCommand("rama-start", {
    description: "Start RAMA Netease watcher and proactive scheduler",
    handler: async (_args, ctx) => {
      const watcher = await startWatcher();
      await scheduler.start(ctx, { notify: true });
      ctx.ui.setStatus("rama", `RAMA ${watcher.running ? "watching" : watcher.state}`);
    },
  });

  pi.registerCommand("rama-stop", {
    description: "Stop RAMA Netease watcher and proactive scheduler",
    handler: async (_args, ctx) => {
      scheduler.stop();
      await stopWatcher();
      ctx.ui.notify("RAMA stopped", "info");
    },
  });

  pi.registerCommand("rama-tick", {
    description: "Run one RAMA proactive check now",
    handler: async (_args, ctx) => {
      const result = await scheduler.tick(ctx, { force: true });
      ctx.ui.notify(`RAMA tick: ${result.message}`, result.sent ? "success" : "info");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    await ensureMemoryFile();
    const watcher = await startWatcher();
    await scheduler.start(ctx, { notify: false });
    ctx.ui.setStatus("rama", `RAMA ${watcher.running ? "watching" : watcher.state}`);
  });

  pi.on("session_shutdown", async () => {
    scheduler.stop();
    await stopWatcher();
  });

  pi.on("before_agent_start", async (event) => {
    return {
      systemPrompt:
        event.systemPrompt +
        "\n\nRAMA Music Agent guidance:\n" +
        "- Use rama_read_memory for durable music preferences.\n" +
        "- Use rama_recent_listening for recent Netease listening evidence.\n" +
        "- Write concise notes with rama_write_memory only when the user clearly expresses music preferences or feedback.\n" +
        "- Keep music replies short, concrete, and natural.\n",
    };
  });
}
