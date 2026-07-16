/**
 * Real command-execution terminal for AXE Core's Terminal tab.
 *
 * This is a genuine shell into the container — not a simulation. Each
 * submitted line is run with `spawn(shell, ['-lc', line])`, streaming
 * stdout/stderr back over the socket as it's produced. It intentionally
 * is NOT a full pty (no raw keystroke streaming, no ANSI/color rendering,
 * no interactive stdin to a running program) — that would need node-pty,
 * which needs a native build step this environment can't reliably compile.
 * What it does give you is real execution: `ollama serve`, `jarvis`, `ps aux`,
 * `ls ~` etc. actually run on the container and their real output streams
 * back live. `cd` is tracked across commands; Ctrl+C sends SIGINT to
 * whatever is currently running.
 */
import type { IncomingMessage, Server as HttpServer } from "node:http";
import type { Socket } from "node:net";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { verifyAccessToken } from "./lib/auth";
import { REPO_ROOT } from "./lib/workspaceFs";
import { logger } from "./lib/logger";

const TERMINAL_PATH = "/api/terminal/ws";
const SHELL = process.env["SHELL"] || "/bin/bash";

type ServerMsg = { type: "output"; data: string } | { type: "exit"; data: number };

function send(ws: WebSocket, msg: ServerMsg) {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function prompt(cwd: string): string {
  return `\r\n${cwd.replace(REPO_ROOT, "~workspace") || "~"} $ `;
}

export function attachTerminalServer(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req: IncomingMessage, socket: Socket, head: Buffer) => {
    const url = new URL(req.url ?? "", "http://internal");
    if (url.pathname !== TERMINAL_PATH) return; // let other upgrade handlers (if any) take it

    void (async () => {
      const token = url.searchParams.get("token");
      // In development, skip Supabase auth so the terminal works without
      // an active Supabase session (Replit workspace usage).
      const isDev = process.env["NODE_ENV"] !== "production";
      const user = isDev
        ? { id: "dev", email: "dev@axe.local" }
        : await verifyAccessToken(token);
      if (!user) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
    })();
  });

  wss.on("connection", (ws: WebSocket) => {
    let cwd = REPO_ROOT;
    let current: ChildProcessWithoutNullStreams | null = null;
    let buffer = "";

    send(ws, { type: "output", data: `Connected — real shell, cwd ${cwd.replace(REPO_ROOT, "~workspace")}${prompt(cwd)}` });

    const runLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) { send(ws, { type: "output", data: prompt(cwd) }); return; }

      const cdMatch = /^cd(?:\s+(.*))?$/.exec(trimmed);
      if (cdMatch) {
        const target = cdMatch[1]?.trim() || REPO_ROOT;
        const nextCwd = target.startsWith("/") ? target : path.resolve(cwd, target);
        try {
          if (!statSync(nextCwd).isDirectory()) throw new Error("not a directory");
          cwd = nextCwd;
        } catch {
          send(ws, { type: "output", data: `cd: no such directory: ${target}` });
        }
        send(ws, { type: "output", data: prompt(cwd) });
        return;
      }

      current = spawn(SHELL, ["-lc", trimmed], { cwd, env: process.env, detached: true });
      current.stdout.on("data", (d) => send(ws, { type: "output", data: d.toString() }));
      current.stderr.on("data", (d) => send(ws, { type: "output", data: d.toString() }));
      current.on("error", (err) => send(ws, { type: "output", data: `\r\n[error] ${err.message}` }));
      current.on("close", () => {
        current = null;
        send(ws, { type: "output", data: prompt(cwd) });
      });
    };

    ws.on("message", (raw) => {
      let parsed: { type?: string; data?: string } | null = null;
      try { parsed = JSON.parse(raw.toString()); } catch { /* ignore malformed frames */ }
      if (!parsed || parsed.type !== "input" || typeof parsed.data !== "string") return;

      if (parsed.data === "\x03") {
        if (current?.pid) {
          try { process.kill(-current.pid, "SIGINT"); } catch { /* process may already be gone */ }
        } else {
          send(ws, { type: "output", data: prompt(cwd) });
        }
        return;
      }

      buffer += parsed.data;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) runLine(line);
    });

    ws.on("close", () => {
      if (current?.pid) { try { process.kill(-current.pid, "SIGTERM"); } catch { /* ignore */ } }
    });

    ws.on("error", (err) => logger.error({ err }, "terminal ws error"));
  });

  logger.info({ path: TERMINAL_PATH }, "Terminal WebSocket server attached");
}
