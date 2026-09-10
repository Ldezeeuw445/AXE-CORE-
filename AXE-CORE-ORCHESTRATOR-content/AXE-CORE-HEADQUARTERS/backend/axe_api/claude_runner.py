"""
claude_runner.py — wraps the Claude Code CLI for the axe_api service.

Branch C: LangGraph -> axe_api /claude/run -> claude_runner -> the `claude`
CLI -> a real Claude Code session inside one whitelisted repository checkout.

Branch A (crew_runner.py) hands work to CrewAI specialists on Ollama; Branch B
is the KiloCode cloud-key gateway. This is the third: an agent that edits code
on disk. That makes three things load-bearing enough to enforce in code here
rather than in a deploy checklist somebody has to remember:

1. WHICH REPOSITORIES may be touched at all -- CLAUDE_CODE_REPOS, an explicit
   whitelist. An unlisted repo is refused; there is no "any path" mode.
2. WHICH BRANCH the checkout may be on -- never main/master. Read live with
   `git rev-parse` at call time, not trusted from the request body.
3. THAT THE SUBPROCESS STARTS WITHOUT AN ANTHROPIC API KEY. The CLI prefers a
   key in its environment over the operator's `claude auth login` OAuth session, so
   a key inherited from this service's own env would silently bill the metered
   API while looking identical in the logs. _subprocess_env() strips it.
"""
from __future__ import annotations
import json
import logging
import os
import shutil
import subprocess

log = logging.getLogger("axe_core_api.claude_runner")

CLAUDE_BIN = os.environ.get("CLAUDE_BIN", "claude")
CLAUDE_TIMEOUT = int(os.environ.get("CLAUDE_TIMEOUT", "900"))

# Refused on every call, whatever the request asks for. Checked against the
# checkout's live branch, so renaming the branch in the request cannot help.
PROTECTED_BRANCHES = {"main", "master"}

# Stripped from the subprocess environment before the CLI starts. This is the
# whole point of _subprocess_env(): with either of these set, Claude Code
# authenticates as a metered API client instead of using the subscription the
# operator logged in with, and nothing in the output says so.
BLOCKED_ENV = ("ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN")

# bypassPermissions is deliberately NOT here: it would let an unattended run
# edit and execute without any gate at all. If that is ever wanted it should be
# a separate, explicitly-named endpoint, not a string in a request body.
ALLOWED_PERMISSION_MODES = ("default", "acceptEdits", "plan")
DEFAULT_PERMISSION_MODE = "acceptEdits"


def _repos() -> dict:
    """Parse CLAUDE_CODE_REPOS -- "name=/abs/path,other=/abs/path".

    Absent or empty means no repository is reachable, which is the correct
    default for a service that edits code: opt in per box, per repo.
    """
    raw = os.environ.get("CLAUDE_CODE_REPOS", "").strip()
    out = {}
    for entry in raw.split(","):
        entry = entry.strip()
        if not entry or "=" not in entry:
            continue
        name, _, path = entry.partition("=")
        name, path = name.strip(), os.path.abspath(os.path.expanduser(path.strip()))
        if name and path:
            out[name] = path
    return out


def _subprocess_env() -> dict:
    """This service's environment minus anything that would make the CLI
    authenticate as a metered API client. See BLOCKED_ENV."""
    env = os.environ.copy()
    for key in BLOCKED_ENV:
        env.pop(key, None)
    return env


def _current_branch(repo_path: str) -> str:
    """The checkout's branch right now, read from git itself.

    Returns "" when the path is not a git worktree or git cannot answer, which
    callers treat as a refusal rather than as permission.
    """
    try:
        proc = subprocess.run(
            ["git", "rev-parse", "--abbrev-ref", "HEAD"],
            cwd=repo_path, capture_output=True, text=True, timeout=15,
        )
    except Exception as e:  # noqa: BLE001
        log.warning("branch check failed in %s: %s", repo_path, e)
        return ""
    if proc.returncode != 0:
        return ""
    return proc.stdout.strip()


def run_claude(
    repo: str,
    prompt: str,
    permission_mode: str = None,
    timeout: int = None,
) -> dict:
    """Run one Claude Code session in `repo` and return its result.

    Every refusal below happens before the CLI is started, so a rejected call
    costs nothing and changes nothing on disk.
    """
    if not prompt or not str(prompt).strip():
        return {"status": "error", "error": "prompt is required"}

    repos = _repos()
    if not repos:
        return {
            "status": "error",
            "error": "No repositories are whitelisted. Set CLAUDE_CODE_REPOS "
                     "(name=/abs/path,other=/abs/path) on this host before using /claude/run.",
        }
    if not repo or repo not in repos:
        return {
            "status": "error",
            "error": f"Unknown repo '{repo}'. Whitelisted: {', '.join(sorted(repos)) or '(none)'}",
        }
    repo_path = repos[repo]

    if not os.path.isdir(repo_path):
        return {"status": "error", "error": f"Repo '{repo}' points at {repo_path}, which does not exist on this host."}
    if not os.path.isdir(os.path.join(repo_path, ".git")):
        return {"status": "error", "error": f"Repo '{repo}' ({repo_path}) is not a git checkout."}

    mode = (permission_mode or DEFAULT_PERMISSION_MODE).strip()
    if mode not in ALLOWED_PERMISSION_MODES:
        return {
            "status": "error",
            "error": f"permission_mode '{mode}' is not allowed. Allowed: {', '.join(ALLOWED_PERMISSION_MODES)}",
        }

    branch = _current_branch(repo_path)
    if not branch:
        return {"status": "error", "error": f"Could not read the current branch of '{repo}' ({repo_path}); refusing to run."}
    if branch in PROTECTED_BRANCHES:
        return {
            "status": "error",
            "error": f"Repo '{repo}' is on protected branch '{branch}'. "
                     f"Check out a working branch before running Claude Code here.",
            "branch": branch,
        }

    binary = shutil.which(CLAUDE_BIN) or (CLAUDE_BIN if os.path.isabs(CLAUDE_BIN) and os.path.exists(CLAUDE_BIN) else None)
    if not binary:
        return {
            "status": "error",
            "error": f"Claude Code CLI not found ('{CLAUDE_BIN}'). Install it with "
                     f"`npm i -g @anthropic-ai/claude-code` and authenticate with `claude auth login` "
                     f"on this host. Do not set ANTHROPIC_API_KEY -- this runner strips it on purpose.",
        }

    limit = int(timeout or CLAUDE_TIMEOUT)
    cmd = [binary, "-p", str(prompt), "--output-format", "json", "--permission-mode", mode]

    try:
        proc = subprocess.run(
            cmd,
            cwd=repo_path,
            env=_subprocess_env(),
            capture_output=True,
            text=True,
            timeout=limit,
        )
    except subprocess.TimeoutExpired:
        return {"status": "error", "error": f"Claude Code run timed out after {limit}s", "repo": repo, "branch": branch}
    except Exception as e:  # noqa: BLE001
        return {"status": "error", "error": f"{type(e).__name__}: {e}", "repo": repo, "branch": branch}

    out = (proc.stdout or "").strip()
    if proc.returncode != 0 and not out:
        return {
            "status": "error",
            "error": f"Claude Code exited {proc.returncode}. stderr: {(proc.stderr or '')[:500]}",
            "repo": repo,
            "branch": branch,
        }

    parsed = None
    try:
        parsed = json.loads(out) if out else None
    except json.JSONDecodeError:
        parsed = None

    if parsed is None:
        # The CLI's --output-format json normally holds, but a version change
        # or a wrapper on PATH shouldn't turn into a fabricated success.
        return {
            "status": "error" if proc.returncode != 0 else "ok",
            "result": out[:8000],
            "raw": True,
            "repo": repo,
            "branch": branch,
            "exit_code": proc.returncode,
        }

    result_text = ""
    failed = proc.returncode != 0
    if isinstance(parsed, dict):
        result_text = str(parsed.get("result") or parsed.get("text") or "")
        # Measured against the real CLI 2.1.250: an auth failure comes back as
        # subtype "success" with is_error true. Trusting subtype (or the exit
        # code alone, should a future version return 0) would report a failed
        # run as ok, which is the one thing this must never do.
        if parsed.get("is_error") is True:
            failed = True
    return {
        "status": "error" if failed else "ok",
        "result": result_text or out[:8000],
        "repo": repo,
        "branch": branch,
        "permission_mode": mode,
        "exit_code": proc.returncode,
        "meta": parsed if isinstance(parsed, dict) else None,
    }


def whitelisted_repos() -> dict:
    """Public view of the repo whitelist, for /health and error messages."""
    return _repos()


def repo_status() -> dict:
    """What /health should be able to say honestly: which repos are configured,
    whether each one exists, and which branch it is sitting on right now."""
    out = {}
    for name, path in sorted(whitelisted_repos().items()):
        exists = os.path.isdir(os.path.join(path, ".git"))
        branch = _current_branch(path) if exists else ""
        out[name] = {
            "path": path,
            "exists": exists,
            "branch": branch or None,
            "runnable": bool(exists and branch and branch not in PROTECTED_BRANCHES),
        }
    return out


def cli_available() -> bool:
    """Whether the Claude Code CLI is actually on this host's PATH."""
    if shutil.which(CLAUDE_BIN):
        return True
    return bool(os.path.isabs(CLAUDE_BIN) and os.path.exists(CLAUDE_BIN))
