---
name: Real terminal without node-pty
description: Pattern for building a genuinely real (not simulated) web terminal when node-pty's native build is too risky for the environment.
---

`node-pty` needs a native compile step that can fail unpredictably in a Nix-based sandbox. A pragmatic alternative that is still a *real* shell (not a fake command interpreter with hardcoded outputs) is:

- Maintain per-connection state server-side: current `cwd`, and the currently-running child process (if any).
- Special-case `cd` in the server to update tracked `cwd` without spawning a process.
- For every other submitted line, `spawn(shell, ['-lc', line], { cwd, detached: true })` and stream stdout/stderr chunks live over the socket as they arrive.
- Ctrl+C maps to `SIGINT` on the tracked child (use `process.kill(-pid, 'SIGINT')` with `detached: true` to hit the whole process group, so subshells/pipelines die too).

**Why:** This gives real command execution, real live output, and real `cd`-tracked state — the three things that matter most for a "quick actions" style dev terminal — without the native-module risk.

**How to apply:** Disclose the tradeoff plainly rather than overselling it as a full pty: no raw interactive stdin to a running foreground program, no ANSI colors (render as plain text), no tab completion. If the frontend protocol has an `exit` message that ends the whole session, only send it on socket close — never after each individual command — or the UI will think the session died after every command.
