"""A real agentic loop for durable AXE tasks.

Replaces the previous `agentic_handler`, which delegated the whole request to
OpenHands in ONE call and recorded whatever text came back as the result. Two
things went wrong with that, both visible in core_tasks:

  * A request to build an Obsidian vault returned a numbered *plan*
    ("1. Create a folder named Trading, 2. Organize subfolders...") and the
    worker stored the plan as the finished work. Nothing was created.
  * Every smoke test 504'd on the OpenHands sandbox, and one was still marked
    `completed` because the agent called finish() with "Task completed
    successfully" while the error field held the timeout.

The cause of the second one is that verification only ever asked "is there a
summary string?". Any sentence passed. An agent graded that way cannot learn:
saying "done" scores the same as being done.

So this module does the two things that were missing:

  1. It LOOPS. The model gets real tools (shell, file read/write) and keeps
     going until the job is actually finished, not until it has produced one
     paragraph.
  2. Finishing requires EVIDENCE. `finish` must supply a command that proves
     the work exists, and this worker runs that command itself. If the proof
     fails, the failure is handed back to the model and the loop continues.
     The model cannot mark its own homework.
"""

from __future__ import annotations

import asyncio
import json
import os
import logging
import subprocess
import time
from typing import Any

# Budget. The old loop allowed 10 steps and 2 minutes, which is not enough to
# do anything real -- a single "read the file, change it, check it built" cycle
# is already three. These are the numbers for a background task, not a chat
# reply; the durable worker holds a lease and heartbeats, so a long run is fine.
MAX_STEPS = 40
WALL_CLOCK_SECONDS = 1800

# Per-command ceiling. Long enough for an install or a build, short enough that
# one hung command cannot eat the whole task budget.
SHELL_TIMEOUT_SECONDS = 240

log = logging.getLogger("axe_agent_loop")

WORKSPACE = os.environ.get("WORKSPACE_DIR", "/opt/axe-workspace")

# A stable alias on purpose. Pinning an exact version (this was gemini-2.5-pro)
# broke on the very first run: Google had already closed that model to new
# callers, so the loop 404'd before doing anything. ListModels still advertised
# it -- being listed and being callable are not the same thing. An alias follows
# Google's current pro model instead of rotting the moment they move on.
MODEL = os.environ.get("AXE_AGENT_MODEL", "gemini-pro-latest")

# The fallback. Not a downgrade to tolerate -- measured on Hetzner while warm:
# a correct tool call in ~13s, and a plain answer in 2.3s. Slower per step than
# Gemini, fast enough for a background agent with a 30-minute budget, and it
# costs nothing and cannot have its key revoked.
#
# Note the ":cloud" models Ollama advertises (kimi, glm, deepseek, minimax) are
# NOT on this box -- they proxy to Ollama's own service and answer 401 without
# an account there. Of the 15 names /api/tags reports, 5 are really local.
OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "https://ollama.axecompanion.com").rstrip("/")
OLLAMA_MODEL = os.environ.get("AXE_AGENT_FALLBACK_MODEL", "llama3.1:8b-32k")
_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

# Cheap insurance on a box that also serves the API. This is not a security
# boundary -- the agent legitimately has shell here -- it only catches the
# catastrophic typo that would take the VPS down with it.
_REFUSED = (
    "rm -rf /", "rm -rf /*", "mkfs", "shutdown", "reboot", "halt",
    "dd if=", ":(){", "> /dev/sda", "chmod -R 000 /",
)


def _refuse(command: str) -> str | None:
    lowered = " ".join(command.lower().split())
    for pattern in _REFUSED:
        if pattern in lowered:
            return f"Refused: command matches the destructive pattern {pattern!r}."
    return None


# Two tiers, not one gate. Asking a human before every `ls` would turn the agent
# back into a remote keyboard and defeat the point of it running unattended --
# but letting it restart services or push to git unattended is a different
# proposition. So: looking around, and working inside its own workspace, is
# free; anything that reaches beyond that asks first.
#
# This is also what finally gives core_approvals a reason to exist. That table
# has never held a single row, because nothing in the system ever requested an
# approval. These commands are the thing that requests one.
_NEEDS_APPROVAL = (
    "systemctl", "service ", "docker", "apt ", "apt-get", "dpkg", "pip install",
    "npm install", "yarn add", "git push", "git commit", "ssh ", "scp ",
    "crontab", "useradd", "usermod", "passwd", "ufw", "iptables", "nginx",
    "certbot", "psql", "supabase",
)


def approval_reason(command: str, cwd: str | None) -> str | None:
    """Return why this command needs Luka's approval, or None if it may run free.

    Conservative in one direction only: an unrecognised command that stays
    inside the workspace runs, because the alternative is an agent that stops
    every few steps and finishes nothing. What earns a prompt is reaching
    *outside* the workspace, or touching the machine itself.
    """
    lowered = " ".join(command.lower().split())

    for pattern in _NEEDS_APPROVAL:
        if pattern in lowered:
            return f"touches the system ({pattern.strip()})"

    # Writing outside the workspace. Reading outside stays free -- the agent has
    # to be able to look at its own source in order to work on it.
    workdir = os.path.realpath(cwd or WORKSPACE)
    if not workdir.startswith(os.path.realpath(WORKSPACE)):
        writes = ("rm ", "mv ", "cp ", "tee ", "truncate", "chmod", "chown", ">")
        if any(token in lowered for token in writes):
            return f"writes outside the workspace ({workdir})"

    return None


class ApprovalRequired(Exception):
    """Raised when the agent needs a command Luka has not approved.

    Not a failure. task_runtime.request_approval already parks the task in
    `waiting_approval` and releases the lease, and deciding it puts the task
    back to `queued` — so the durable machinery for pausing and resuming was
    always there. This exception is only how the loop hands control back.
    """

    def __init__(self, command: str, reason: str):
        super().__init__(f"needs approval ({reason}): {command}")
        self.command = command
        self.reason = reason


def normalize_command(command: str) -> str:
    """Whitespace-insensitive key for comparing an approved command to a rerun.

    Without this the resumed attempt asks for approval again the moment the
    model reformats its own command by a space, and the task loops between
    queued and waiting_approval forever.
    """
    return " ".join(command.split())


TOOL_DECLARATIONS = [
    {
        "name": "run_shell",
        "description": (
            "Run a shell command on the AXE VPS and get back stdout, stderr and the "
            "exit code. This is how you inspect and change the system. Prefer small, "
            "checkable commands over one long chain so you can see where it breaks."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "command": {"type": "string", "description": "The command to run."},
                "cwd": {"type": "string", "description": f"Working directory. Defaults to {WORKSPACE}."},
            },
            "required": ["command"],
        },
    },
    {
        "name": "read_file",
        "description": "Read a text file. Use this before editing so you change what is actually there.",
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "max_bytes": {"type": "integer", "description": "Default 60000."},
            },
            "required": ["path"],
        },
    },
    {
        "name": "write_file",
        "description": (
            "Write a file, creating parent directories as needed. Overwrites. "
            "Returns the number of bytes written so you can confirm it landed."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "path": {"type": "string"},
                "content": {"type": "string"},
            },
            "required": ["path", "content"],
        },
    },
    {
        "name": "finish",
        "description": (
            "Call this ONLY when the work is actually done and you can prove it. "
            "You must supply a command that demonstrates the result exists, and a "
            "string that must appear in that command's output. The worker runs the "
            "command itself and checks. If the proof fails you will be told, and you "
            "must keep working -- a description of what you intended does not count "
            "as finished."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "summary": {
                    "type": "string",
                    "description": "What you actually did, in plain language.",
                },
                "verify_command": {
                    "type": "string",
                    "description": (
                        "A command proving the work exists, e.g. "
                        "'ls /opt/axe-workspace/Trading' or 'python3 -c \"import mod\"'."
                    ),
                },
                "expect_in_output": {
                    "type": "string",
                    "description": "A substring that must appear in that command's output.",
                },
            },
            "required": ["summary", "verify_command", "expect_in_output"],
        },
    },
]

SYSTEM_PROMPT = f"""You are AXE, operating your own infrastructure on the AXE VPS.

You have a real shell and a real filesystem. Your working directory is {WORKSPACE}.

The single most important rule: DO THE WORK, do not describe it. A plan is not a
deliverable. If the user asks you to create something, create it, then look at
what you created and confirm it is there. You are being measured on what exists
when you stop, not on what you said you would do.

How to work:
  - Look before you change. Read the file, list the directory, check the state.
  - Take small steps and check the result of each one.
  - If a command fails, read the error and adapt. Do not repeat it unchanged.
  - When you believe you are done, call finish() with a command that PROVES it.
    The worker will run that command. If the proof fails you will be sent back
    to keep working, so make the proof something that genuinely demonstrates
    the result.

You have {MAX_STEPS} steps. Use them."""


def _shell(command: str, cwd: str | None = None) -> dict[str, Any]:
    refusal = _refuse(command)
    if refusal:
        return {"exit_code": 126, "stdout": "", "stderr": refusal}
    workdir = cwd or WORKSPACE
    os.makedirs(workdir, exist_ok=True)
    try:
        proc = subprocess.run(
            command, shell=True, cwd=workdir, capture_output=True,
            text=True, timeout=SHELL_TIMEOUT_SECONDS,
        )
        return {
            "exit_code": proc.returncode,
            "stdout": proc.stdout[-20000:],
            "stderr": proc.stderr[-8000:],
        }
    except subprocess.TimeoutExpired:
        return {
            "exit_code": 124, "stdout": "",
            "stderr": f"Timed out after {SHELL_TIMEOUT_SECONDS}s.",
        }


def _read(path: str, max_bytes: int = 60000) -> dict[str, Any]:
    try:
        with open(path, "r", errors="replace") as handle:
            data = handle.read(max_bytes + 1)
        return {
            "content": data[:max_bytes],
            "truncated": len(data) > max_bytes,
        }
    except Exception as exc:
        return {"error": str(exc)}


def _write(path: str, content: str) -> dict[str, Any]:
    try:
        parent = os.path.dirname(path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        with open(path, "w") as handle:
            handle.write(content)
        return {"bytes_written": len(content.encode()), "path": path}
    except Exception as exc:
        return {"error": str(exc)}


async def _call_gemini(contents: list[dict[str, Any]], api_key: str) -> dict[str, Any]:
    import httpx

    payload = {
        "contents": contents,
        "tools": [{"functionDeclarations": TOOL_DECLARATIONS}],
        "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "generationConfig": {"temperature": 0.2},
    }
    url = _ENDPOINT.format(model=MODEL)
    async with httpx.AsyncClient(timeout=180) as client:
        response = await client.post(
            url, params={"key": api_key}, json=payload,
            headers={"Content-Type": "application/json"},
        )
    if response.status_code != 200:
        raise RuntimeError(f"gemini {response.status_code}: {response.text[:300]}")
    data = response.json()
    candidates = data.get("candidates") or []
    if not candidates:
        raise RuntimeError(f"gemini returned no candidates: {json.dumps(data)[:300]}")
    return candidates[0].get("content") or {}


def _to_ollama_messages(contents: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Gemini's `contents` -> Ollama's OpenAI-shaped `messages`.

    Gemini's shape stays canonical inside the loop, because it was here first
    and the rest of the code reads it. Only the wire format changes per
    provider, so a fallback cannot subtly lose the conversation.
    """
    out: list[dict[str, Any]] = [{"role": "system", "content": SYSTEM_PROMPT}]
    for entry in contents:
        role = entry.get("role")
        parts = entry.get("parts") or []

        calls = [p["functionCall"] for p in parts if "functionCall" in p]
        responses = [p["functionResponse"] for p in parts if "functionResponse" in p]
        text = " ".join(p["text"] for p in parts if p.get("text"))

        if calls:
            out.append({
                "role": "assistant",
                "content": text,
                "tool_calls": [
                    {"function": {"name": c.get("name"), "arguments": c.get("args") or {}}}
                    for c in calls
                ],
            })
        elif responses:
            # One tool message per result, which is what the OpenAI shape expects.
            for r in responses:
                out.append({
                    "role": "tool",
                    "content": json.dumps(r.get("response") or {})[:20000],
                })
        elif text:
            out.append({"role": "assistant" if role == "model" else "user", "content": text})
    return out


async def _call_ollama(contents: list[dict[str, Any]]) -> dict[str, Any]:
    """Same loop, local model. Returns Gemini-shaped content so the caller
    cannot tell which provider answered."""
    import httpx

    payload = {
        "model": OLLAMA_MODEL,
        "stream": False,
        # Pinned in memory. Measured on Hetzner: 103s cold, 2.3s warm -- a
        # fallback that takes a minute and a half to wake up is not a fallback.
        "keep_alive": -1,
        "messages": _to_ollama_messages(contents),
        "tools": [
            {"type": "function", "function": {
                "name": t["name"],
                "description": t["description"],
                "parameters": t["parameters"],
            }}
            for t in TOOL_DECLARATIONS
        ],
        "options": {"temperature": 0.2},
    }
    async with httpx.AsyncClient(timeout=300) as client:
        response = await client.post(
            f"{OLLAMA_HOST}/api/chat", json=payload,
            headers={"Content-Type": "application/json"},
        )
    if response.status_code != 200:
        raise RuntimeError(f"ollama {response.status_code}: {response.text[:300]}")

    message = response.json().get("message") or {}
    parts: list[dict[str, Any]] = []
    if message.get("content"):
        parts.append({"text": message["content"]})
    for call in message.get("tool_calls") or []:
        fn = call.get("function") or {}
        args = fn.get("arguments")
        if isinstance(args, str):
            try:
                args = json.loads(args)
            except json.JSONDecodeError:
                args = {}
        parts.append({"functionCall": {"name": fn.get("name"), "args": args or {}}})
    if not parts:
        raise RuntimeError("ollama returned neither text nor a tool call")
    return {"parts": parts}


async def _call_model(contents: list[dict[str, Any]], api_key: str | None) -> dict[str, Any]:
    """Try each provider in turn until one answers.

    Ordered, never raced. Racing every provider on every step is what used to
    flatten the VPS; this walks a short list and stops at the first result.

    Why this exists at all: the loop was pinned to Gemini with no fallback, so
    the day that key died -- and it did, with a 401 the same week -- the agent
    died with it. Luka's point, and he was right: "er zijn modellen met genoeg
    capability die dat gewoon over kunnen nemen." Verified on Hetzner:
    llama3.1:8b-32k returns a correct tool call in ~13s while warm.
    """
    attempts: list[tuple[str, Any]] = []
    if api_key:
        attempts.append((f"gemini/{MODEL}", lambda: _call_gemini(contents, api_key)))
    attempts.append((f"ollama/{OLLAMA_MODEL}", lambda: _call_ollama(contents)))

    errors: list[str] = []
    for name, call in attempts:
        try:
            return await call()
        except Exception as exc:
            log.warning("[agent_loop] %s failed: %s", name, str(exc)[:200])
            errors.append(f"{name}: {str(exc)[:150]}")
    raise RuntimeError("every provider failed — " + " | ".join(errors))


async def run_agent_loop(
    request_text: str,
    task_id: str,
    on_event,
    approved_commands: tuple[str, ...] = (),
) -> dict[str, Any]:
    """Run the request to completion.

    `on_event(kind, message, data)` is awaited for each step so the caller can
    stream progress into core_task_events.

    `approved_commands` are commands Luka has already approved for THIS task, so
    a resumed attempt runs straight through the thing it previously stopped on
    instead of asking again.
    """
    pre_approved = {normalize_command(c) for c in approved_commands}
    # No longer required. A missing or dead Gemini key now means the loop runs
    # on the local model instead of refusing to start.
    api_key = os.environ.get("GEMINI_API_KEY")

    contents: list[dict[str, Any]] = [
        {"role": "user", "parts": [{"text": request_text}]}
    ]
    started = time.monotonic()
    transcript: list[dict[str, Any]] = []

    for step in range(1, MAX_STEPS + 1):
        if time.monotonic() - started > WALL_CLOCK_SECONDS:
            raise RuntimeError(
                f"ran out of time after {step - 1} steps "
                f"({WALL_CLOCK_SECONDS}s budget). Transcript kept for the next attempt."
            )

        content = await _call_model(contents, api_key)
        parts = content.get("parts") or []
        contents.append({"role": "model", "parts": parts})

        calls = [p["functionCall"] for p in parts if "functionCall" in p]
        texts = [p["text"] for p in parts if p.get("text")]

        if not calls:
            # The model stopped without calling finish. That is exactly the old
            # failure -- talking instead of doing -- so push it back to work
            # rather than accepting the prose as a result.
            said = " ".join(texts).strip() or "(nothing)"
            await on_event("axe.progress", f"Step {step}: no action taken, prompting to continue.", {})
            contents.append({
                "role": "user",
                "parts": [{"text": (
                    "You produced text but took no action, and you have not called "
                    "finish(). Text is not a deliverable. Either use a tool to make "
                    "progress, or call finish() with a verify_command that proves the "
                    "work exists."
                )}],
            })
            transcript.append({"step": step, "tool": None, "note": said[:400]})
            continue

        responses = []
        for call in calls:
            name = call.get("name")
            args = call.get("args") or {}

            if name == "finish":
                summary = str(args.get("summary") or "").strip()
                verify_command = str(args.get("verify_command") or "").strip()
                expect = str(args.get("expect_in_output") or "").strip()

                await on_event(
                    "axe.progress",
                    f"Step {step}: agent claims completion, verifying with `{verify_command[:120]}`.",
                    {"verify_command": verify_command},
                )
                proof = await asyncio.to_thread(_shell, verify_command)
                combined = (proof.get("stdout") or "") + (proof.get("stderr") or "")
                passed = proof.get("exit_code") == 0 and expect in combined

                transcript.append({
                    "step": step, "tool": "finish", "verify_command": verify_command,
                    "expect": expect, "exit_code": proof.get("exit_code"), "passed": passed,
                })

                if passed:
                    await on_event(
                        "verification.passed",
                        "Proof command ran and produced the expected result.",
                        {"verify_command": verify_command, "expect": expect},
                    )
                    return {
                        "summary": summary,
                        "steps_used": step,
                        "verification": {
                            "passed": True,
                            "checks": [{
                                "name": "proof_command",
                                "passed": True,
                                "command": verify_command,
                                "expected": expect,
                                "exit_code": proof.get("exit_code"),
                                "output": combined[-2000:],
                            }],
                        },
                        "transcript": transcript,
                    }

                # Proof failed: this is the case the old worker marked as success.
                await on_event(
                    "verification.failed",
                    f"Completion claim rejected — proof command exited {proof.get('exit_code')}.",
                    {"verify_command": verify_command},
                )
                responses.append({
                    "functionResponse": {
                        "name": "finish",
                        "response": {
                            "accepted": False,
                            "reason": (
                                f"Your proof did not hold. `{verify_command}` exited with "
                                f"{proof.get('exit_code')} and its output did not contain "
                                f"{expect!r}. Output was:\n{combined[-3000:]}\n\n"
                                "You are NOT finished. Keep working."
                            ),
                        },
                    }
                })
                continue

            if name == "run_shell":
                command = str(args.get("command") or "")
                needs = approval_reason(command, args.get("cwd"))
                if needs and normalize_command(command) in pre_approved:
                    # Luka already said yes to exactly this command on this task.
                    await on_event(
                        "axe.progress",
                        f"Step {step}: running approved command — {command[:140]}",
                        {"command": command, "approved": True},
                    )
                    needs = None
                if needs:
                    # Stop rather than route around it. Telling the model "carry
                    # on without this" invites it to declare victory on the half
                    # it could reach -- the exact dishonesty this whole loop was
                    # built to remove. Parking the task keeps the transcript, and
                    # approving resumes it from here.
                    transcript.append({
                        "step": step, "tool": "run_shell",
                        "command": command[:400], "approval_required": needs,
                    })
                    raise ApprovalRequired(command, needs)
                else:
                    await on_event("axe.progress", f"Step {step}: $ {command[:160]}", {})
                    result = await asyncio.to_thread(_shell, command, args.get("cwd"))
                    transcript.append({
                        "step": step, "tool": "run_shell",
                        "command": command[:400], "exit_code": result.get("exit_code"),
                    })
            elif name == "read_file":
                path = str(args.get("path") or "")
                await on_event("axe.progress", f"Step {step}: reading {path[:160]}", {})
                result = await asyncio.to_thread(
                    _read, path, int(args.get("max_bytes") or 60000)
                )
                transcript.append({"step": step, "tool": "read_file", "path": path[:300]})
            elif name == "write_file":
                path = str(args.get("path") or "")
                await on_event("axe.progress", f"Step {step}: writing {path[:160]}", {})
                result = await asyncio.to_thread(
                    _write, path, str(args.get("content") or "")
                )
                transcript.append({
                    "step": step, "tool": "write_file", "path": path[:300],
                    "bytes": result.get("bytes_written"),
                })
            else:
                result = {"error": f"unknown tool {name!r}"}
                transcript.append({"step": step, "tool": name, "error": "unknown"})

            responses.append({
                "functionResponse": {"name": name, "response": result}
            })

        contents.append({"role": "user", "parts": responses})

    raise RuntimeError(
        f"used all {MAX_STEPS} steps without a verified result. "
        "The transcript is preserved on the task for the next attempt."
    )
