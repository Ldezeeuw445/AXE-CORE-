"""
test_claude_runner.py — logic-level tests for Branch C.

Real git repositories in a temp dir, and a stand-in `claude` binary that
reports back the environment it was actually started with. Nothing is mocked
except the CLI itself, so the branch guard, the whitelist and the env strip are
all exercised against real behaviour rather than against a patched function.

Run:  python3 test_claude_runner.py
"""
import json
import os
import shutil
import stat
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

FAKE_CLAUDE = """#!/usr/bin/env python3
import json, os, sys
# Report the environment this process actually received, so the test can prove
# the parent stripped the keys rather than take the parent's word for it.
print(json.dumps({
    "result": "fake-claude ok",
    "saw_api_key": os.environ.get("ANTHROPIC_API_KEY"),
    "saw_auth_token": os.environ.get("ANTHROPIC_AUTH_TOKEN"),
    "cwd": os.getcwd(),
    "argv": sys.argv[1:],
}))
"""

PASS, FAIL = [], []


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(("  PASS  " if cond else "  FAIL  ") + name + (f"   {detail}" if detail and not cond else ""))


def git(repo, *args):
    subprocess.run(["git", "-C", repo, *args], check=True,
                   capture_output=True, text=True)


def make_repo(root, name, branch):
    path = os.path.join(root, name)
    os.makedirs(path)
    git(path, "init", "-q")
    git(path, "config", "user.email", "test@example.com")
    git(path, "config", "user.name", "test")
    open(os.path.join(path, "README.md"), "w").write("x\n")
    git(path, "add", ".")
    git(path, "commit", "-qm", "init")
    git(path, "branch", "-M", branch)
    return path


def main():
    root = tempfile.mkdtemp(prefix="claude-runner-test-")
    try:
        bindir = os.path.join(root, "bin")
        os.makedirs(bindir)
        fake = os.path.join(bindir, "claude")
        open(fake, "w").write(FAKE_CLAUDE)
        os.chmod(fake, os.stat(fake).st_mode | stat.S_IEXEC | stat.S_IXGRP | stat.S_IXOTH)

        on_master = make_repo(root, "protected", "master")
        on_main = make_repo(root, "protected-main", "main")
        on_feature = make_repo(root, "working", "feat/some-work")
        not_a_repo = os.path.join(root, "plain")
        os.makedirs(not_a_repo)

        # Poison this process's own environment on purpose: the runner must
        # strip these before the subprocess starts.
        os.environ["ANTHROPIC_API_KEY"] = "sk-ant-POISON-should-never-reach-the-cli"
        os.environ["ANTHROPIC_AUTH_TOKEN"] = "POISON-TOKEN"
        os.environ["PATH"] = bindir + os.pathsep + os.environ["PATH"]
        os.environ["CLAUDE_CODE_REPOS"] = ",".join([
            f"protected={on_master}",
            f"protected-main={on_main}",
            f"working={on_feature}",
            f"plain={not_a_repo}",
            f"missing={os.path.join(root, 'does-not-exist')}",
        ])

        import claude_runner as cr

        print("\n-- environment --")
        env = cr._subprocess_env()
        check("_subprocess_env strips ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY" not in env)
        check("_subprocess_env strips ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_AUTH_TOKEN" not in env)
        check("_subprocess_env keeps PATH", "PATH" in env)
        check("parent process still has the key (strip is not global)",
              os.environ.get("ANTHROPIC_API_KEY") == "sk-ant-POISON-should-never-reach-the-cli")

        print("\n-- whitelist --")
        r = cr.run_claude("not-listed", "hello")
        check("unknown repo refused", r["status"] == "error" and "Unknown repo" in r["error"], r)
        r = cr.run_claude("plain", "hello")
        check("non-git path refused", r["status"] == "error" and "not a git checkout" in r["error"], r)
        r = cr.run_claude("missing", "hello")
        check("missing path refused", r["status"] == "error" and "does not exist" in r["error"], r)
        r = cr.run_claude("working", "")
        check("empty prompt refused", r["status"] == "error" and "prompt is required" in r["error"], r)

        print("\n-- branch guard --")
        r = cr.run_claude("protected", "hello")
        check("master refused", r["status"] == "error" and "protected branch" in r["error"], r)
        check("master refusal names the branch", r.get("branch") == "master", r)
        r = cr.run_claude("protected-main", "hello")
        check("main refused", r["status"] == "error" and "protected branch" in r["error"], r)

        print("\n-- permission mode --")
        r = cr.run_claude("working", "hello", permission_mode="bypassPermissions")
        check("bypassPermissions refused", r["status"] == "error" and "not allowed" in r["error"], r)
        r = cr.run_claude("working", "hello", permission_mode="nonsense")
        check("unknown mode refused", r["status"] == "error" and "not allowed" in r["error"], r)

        print("\n-- a run that is allowed to happen --")
        r = cr.run_claude("working", "do the thing", permission_mode="plan")
        check("feature branch allowed", r["status"] == "ok", r)
        check("branch reported", r.get("branch") == "feat/some-work", r)
        check("permission_mode echoed", r.get("permission_mode") == "plan", r)
        meta = r.get("meta") or {}
        check("CLI saw NO ANTHROPIC_API_KEY", meta.get("saw_api_key") is None, meta)
        check("CLI saw NO ANTHROPIC_AUTH_TOKEN", meta.get("saw_auth_token") is None, meta)
        check("CLI ran inside the repo", os.path.realpath(meta.get("cwd", "")) == os.path.realpath(on_feature), meta)
        check("permission mode passed to the CLI",
              "--permission-mode" in (meta.get("argv") or []) and "plan" in (meta.get("argv") or []), meta)

        print("\n-- introspection --")
        st = cr.repo_status()
        check("repo_status marks the feature repo runnable", st["working"]["runnable"] is True, st.get("working"))
        check("repo_status marks master NOT runnable", st["protected"]["runnable"] is False, st.get("protected"))
        check("repo_status marks missing repo NOT runnable", st["missing"]["runnable"] is False, st.get("missing"))
        check("cli_available finds the stand-in", cr.cli_available() is True)

        print("\n-- no whitelist at all --")
        os.environ["CLAUDE_CODE_REPOS"] = ""
        r = cr.run_claude("working", "hello")
        check("empty whitelist refuses everything", r["status"] == "error" and "No repositories are whitelisted" in r["error"], r)

    finally:
        shutil.rmtree(root, ignore_errors=True)

    print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
    if FAIL:
        for f in FAIL:
            print("  FAILED: " + f)
        sys.exit(1)


if __name__ == "__main__":
    main()
