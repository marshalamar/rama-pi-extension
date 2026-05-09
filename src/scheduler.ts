import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { readRecentListening, snapshotStatus } from "./listening.js";
import { readMemory } from "./memory.js";

type TickOptions = {
  force?: boolean;
};

type StartOptions = {
  notify?: boolean;
};

const intervalMs = Number(process.env.RAMA_PROACTIVE_INTERVAL_MS || 5 * 60 * 1000);
const cooldownMs = Number(process.env.RAMA_PROACTIVE_COOLDOWN_MS || 60 * 60 * 1000);

export function createScheduler(pi: ExtensionAPI) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastHash: string | undefined;
  let lastSentAt = 0;
  let ticking = false;

  async function tick(ctx: ExtensionContext, options: TickOptions = {}) {
    if (ticking) return { sent: false, message: "already running" };
    ticking = true;

    try {
      const status = await snapshotStatus();
      if (status.state !== "ready" || !("hash" in status)) {
        return { sent: false, message: `snapshot ${status.state}` };
      }

      if (!lastHash) {
        lastHash = status.hash;
        return { sent: false, message: "baseline recorded" };
      }

      const changed = status.hash !== lastHash;
      const cooledDown = Date.now() - lastSentAt >= cooldownMs;
      lastHash = status.hash;

      if (!options.force && (!changed || !cooledDown)) {
        return {
          sent: false,
          message: changed ? "cooldown active" : "no listening change",
        };
      }

      const [recent, memory] = await Promise.all([readRecentListening(12), readMemory()]);
      const prompt = [
        "[rama proactive]",
        "你是 RAMA。基于下面的本地音乐记忆和最近网易云原始记录，给用户发起一轮很短的中文音乐 check-in。",
        "要求：只问一个自然问题；30 字以内；不要 Markdown；不要提 JSON、snapshot、脚本、工具；不要编造。",
        "",
        "Music memory:",
        memory.content.trim() || "(empty)",
        "",
        "Recent listening raw data:",
        JSON.stringify(recent, null, 2),
      ].join("\n");

      pi.sendUserMessage(prompt);
      lastSentAt = Date.now();
      ctx.ui.setStatus("rama", "RAMA proactive sent");
      return { sent: true, message: "proactive prompt sent" };
    } finally {
      ticking = false;
    }
  }

  async function start(ctx: ExtensionContext, options: StartOptions = {}) {
    if (timer) {
      if (options.notify) ctx.ui.notify("RAMA scheduler already running", "info");
      return;
    }

    const status = await snapshotStatus();
    if (status.state === "ready" && "hash" in status) {
      lastHash = status.hash;
    }

    timer = setInterval(() => {
      void tick(ctx).catch((error) => {
        ctx.ui.setStatus("rama", `RAMA error: ${error instanceof Error ? error.message : String(error)}`);
      });
    }, Math.max(30_000, intervalMs));

    ctx.ui.setStatus("rama", "RAMA watching");
    if (options.notify) ctx.ui.notify("RAMA scheduler started", "success");
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = undefined;
  }

  return {
    start,
    stop,
    tick,
    isRunning: () => Boolean(timer),
  };
}
