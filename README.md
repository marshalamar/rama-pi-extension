# RAMA Pi Extension

RAMA as a native Pi extension. This first version is intentionally small:

- reads `music-memory.md`
- reads `~/.ncm-watcher/last-snapshot.json`
- exposes tools for recent listening, memory updates, in-session Netease watcher status, and RYM lookup
- runs a session-local proactive scheduler that can inject a short music check-in when listening data changes

## Run

From the `rama` repo:

```bash
pi -e ./rama-pi-extension/index.ts
```

Inside Pi:

```txt
/rama-status
/rama-tick
/rama-start
/rama-stop
```

The scheduler is conservative. On session start it records the current snapshot and does not send a message immediately. After that, it only sends a proactive prompt when the snapshot changes and the cooldown has elapsed.

`rama_start_watcher` does not spawn a separate `ncm-watcher` process. The Pi extension itself watches the Netease history file, diffs the rolling history window, and writes:

- `~/.ncm-watcher/last-snapshot.json`
- `~/.ncm-watcher/play-events.jsonl`

## Environment

- `RAMA_MUSIC_MEMORY`: override memory file path.
- `RAMA_NCM_SNAPSHOT`: override Netease watcher snapshot path.
- `RAMA_NCM_HISTORY`: override the Netease local history file path.
- `RAMA_NCM_EVENTS`: override play events JSONL path.
- `RAMA_RYM_LOOKUP_SCRIPT`: override RYM lookup script path.
- `RAMA_PYTHON_COMMAND`: force Python command.
- `RAMA_PROACTIVE_INTERVAL_MS`: polling interval, default `300000`.
- `RAMA_PROACTIVE_COOLDOWN_MS`: proactive cooldown, default `3600000`.
