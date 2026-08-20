#!/usr/bin/env python3
"""
vps_sync — the box and git, told apart before anything is overwritten.

WHAT KEPT GOING WRONG

Every incident had the same shape: a file was edited in one place and deployed
from another, and nothing compared them first.

  * The CORS headers for supabase-js were added on the box and never committed.
    deploy.sh ran twice that day and restored main.py from the repo both times,
    silently removing them. The phone started failing every /supabase/table
    call, reported as a missing-origin error, which points at the wrong thing.
  * infra/axe-core-api/deploy.sh ships the infra directory. Measured against the
    live box on 2026-08-20: main.py there matched backend/axe_api/main.py
    EXACTLY and infra's copy not at all. Running it would have rolled main.py
    back 34 lines, replaced task_worker.py with a version predating the agent
    loop and approvals, and not shipped agent_loop.py at all -- which that
    worker imports, so the service would not have started.
  * The unit was renamed on the box. "systemctl restart axe_api" answered
    "Unit not found" while the service ran happily as axe-core-api.

None of that is carelessness. It is that "which copy is real?" was a question
nobody could answer in less than twenty minutes, so nobody asked it.

WHAT THIS DOES INSTEAD

MANIFEST below maps each remote path to exactly ONE repo path, measured against
the running box rather than assumed. That makes the question decidable:

  IN SYNC     box == its mapped repo file. Nothing to do.
  REPO AHEAD  box == nothing, repo has changes -> safe to deploy.
  BOX DRIFT   box matches neither its repo file nor anything else in git.
              Someone edited the box. Deploying would destroy it.
  MISSING     the file is not on the box at all.

`deploy` refuses to run while anything is in BOX DRIFT, and it only ships files
that are actually REPO AHEAD -- so a deploy can no longer quietly rewrite a
file nobody meant to touch. `capture` pulls a drifted file back into its repo
path so the drift becomes a diff you can read and commit.

NOTE THE MANIFEST IS A MIX OF TWO DIRECTORIES, and that is not a mistake:
main.py and the task runtime live in backend/axe_api/, while flow_runner.py,
run_flow.py and the two test scripts exist only in infra/axe-core-api/. There
is no single directory that is "the source", which is exactly why picking one
by eye kept going wrong.

USAGE
    python3 scripts/vps_sync.py check
    python3 scripts/vps_sync.py capture task_worker.py
    python3 scripts/vps_sync.py deploy
    python3 scripts/vps_sync.py deploy --only nautilus_backtest.py
"""
import argparse
import hashlib
import os
import subprocess
import sys

HOST = os.environ.get("AXE_VPS_HOST", "root@212.227.91.79")
KEY = os.environ.get("AXE_VPS_KEY", os.path.expanduser("~/.ssh/axe-core-vps"))
HQ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# remote path -> (repo path, unit to restart or None)
#
# Verified file by file against the running box on 2026-08-20. Do not "tidy"
# these into one directory without re-measuring: four of them genuinely only
# exist under infra/.
MANIFEST = {
    "/opt/axe-core-api/main.py": ("backend/axe_api/main.py", "axe-core-api"),
    "/opt/axe-core-api/task_runtime.py": ("backend/axe_api/task_runtime.py", "axe-core-api"),
    "/opt/axe-core-api/task_worker.py": ("backend/axe_api/task_worker.py", "axe-task-worker"),
    "/opt/axe-core-api/agent_loop.py": ("backend/axe_api/agent_loop.py", "axe-task-worker"),
    "/opt/axe-core-api/browser_agent.py": ("backend/axe_api/browser_agent.py", "axe-core-api"),
    "/opt/axe-core-api/crew_runner.py": ("backend/axe_api/crew_runner.py", "axe-core-api"),
    "/opt/axe-core-api/run_crew.py": ("backend/axe_api/run_crew.py", None),
    "/opt/axe-core-api/flow_runner.py": ("infra/axe-core-api/flow_runner.py", "axe-core-api"),
    "/opt/axe-core-api/run_flow.py": ("infra/axe-core-api/run_flow.py", None),
    "/opt/axe-core-api/backend_test.py": ("infra/axe-core-api/backend_test.py", None),
    "/opt/axe-core-api/quick_test.py": ("infra/axe-core-api/quick_test.py", None),
    "/opt/axe-trading/vbt_backtest.py": ("backend/axe_trading/vbt_backtest.py", None),
    "/opt/axe-nautilus/nautilus_backtest.py": ("backend/axe_trading/nautilus_backtest.py", None),
    "/opt/axe-tradingagents/tradingagents_engine.py": ("backend/axe_trading/tradingagents_engine.py", None),
    "/etc/systemd/system/axe-core-api.service": ("backend/axe_api/axe-core-api.service", "axe-core-api"),
    "/etc/systemd/system/axe-task-worker.service": ("backend/axe_api/axe-task-worker.service", "axe-task-worker"),
}

IN_SYNC, REPO_AHEAD, BOX_DRIFT, MISSING = "IN SYNC", "REPO AHEAD", "BOX DRIFT", "MISSING"


def ssh(cmd: str) -> str:
    return subprocess.run(
        ["ssh", "-i", KEY, "-o", "BatchMode=yes", "-o", "ConnectTimeout=10", HOST, cmd],
        capture_output=True, text=True,
    ).stdout


def md5_local(path: str):
    try:
        with open(path, "rb") as fh:
            return hashlib.md5(fh.read()).hexdigest()
    except OSError:
        return None


def remote_sums() -> dict:
    out = ssh("md5sum " + " ".join(MANIFEST) + " 2>/dev/null")
    sums = {}
    for line in out.splitlines():
        parts = line.split(None, 1)
        if len(parts) == 2:
            sums[parts[1].strip()] = parts[0].strip()
    return sums


def survey():
    """Classify every managed file. Returns [(remote, repo, unit, state)]."""
    box = remote_sums()
    rows = []
    for remote, (rel, unit) in MANIFEST.items():
        local = md5_local(os.path.join(HQ, rel))
        there = box.get(remote)
        if there is None:
            state = MISSING
        elif local is None:
            # In the manifest but not in the repo -- the file exists only on the
            # box. That is drift too, just the kind that looks like nothing.
            state = BOX_DRIFT
        elif there == local:
            state = IN_SYNC
        else:
            # The box differs from its mapped repo file. Whether that is the
            # repo moving forward or the box being edited cannot be told from
            # hashes alone, so ask git: if the box's content is any committed
            # version of this file, the repo is simply ahead.
            state = REPO_AHEAD if known_to_git(rel, there) else BOX_DRIFT
        rows.append((remote, rel, unit, state))
    return rows


def known_to_git(rel: str, box_md5: str) -> bool:
    """Has this exact content ever been committed for this path?

    This is what separates "we changed it, the box is just behind" from
    "someone edited the box". Without it every pending change would look like
    drift and the guard would cry wolf until it got switched off.
    """
    log = subprocess.run(
        ["git", "-C", HQ, "log", "--format=%H", "-n", "40", "--", rel],
        capture_output=True, text=True,
    ).stdout.split()
    for sha in log:
        # `git show <sha>:<path>` resolves <path> from the REPO ROOT, and this
        # directory is not the repo root -- HQ sits two levels down. Without the
        # leading ./ (which means "relative to cwd") every lookup missed, so
        # known_to_git always said no and every ordinary pending change was
        # reported as BOX DRIFT. A guard that cries wolf gets switched off,
        # which would have been worse than not writing it.
        blob = subprocess.run(
            ["git", "-C", HQ, "show", f"{sha}:./{rel}"], capture_output=True
        ).stdout
        if blob and hashlib.md5(blob).hexdigest() == box_md5:
            return True
    return False


def cmd_check(args) -> int:
    rows = survey()
    width = max(len(r.rsplit("/", 1)[-1]) for r, _, _, _ in rows)
    drift, ahead = [], []
    for remote, rel, _unit, state in sorted(rows, key=lambda r: r[3]):
        name = remote.rsplit("/", 1)[-1]
        mark = {IN_SYNC: "  ", REPO_AHEAD: "→ ", BOX_DRIFT: "!!", MISSING: "??"}[state]
        print(f" {mark} {name:<{width}}  {state:<10} {rel}")
        if state == BOX_DRIFT:
            drift.append(name)
        if state == REPO_AHEAD:
            ahead.append(name)

    print()
    if drift:
        print(f"✗ {len(drift)} file(s) edited on the box and not in git: {', '.join(drift)}")
        print("  Deploying would destroy that work. Pull it in first:")
        for d in drift:
            print(f"      python3 scripts/vps_sync.py capture {d}")
        return 1
    if ahead:
        print(f"→ {len(ahead)} file(s) ready to deploy: {', '.join(ahead)}")
    else:
        print("✓ box and repo agree on every managed file")
    return 0


def cmd_capture(args) -> int:
    wanted = set(args.names)
    hit = False
    for remote, (rel, _unit) in MANIFEST.items():
        if remote.rsplit("/", 1)[-1] not in wanted:
            continue
        hit = True
        dest = os.path.join(HQ, rel)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        subprocess.run(["scp", "-i", KEY, "-q", f"{HOST}:{remote}", dest], check=True)
        print(f"  pulled {remote} -> {rel}")
    if not hit:
        print(f"nothing in the manifest named: {', '.join(wanted)}")
        return 1
    print("\nNow read the diff and commit it. That is the box's own version —\n"
          "it is running, so treat it as the truth until you decide otherwise.")
    return 0


def cmd_deploy(args) -> int:
    rows = survey()
    drift = [r for r in rows if r[3] == BOX_DRIFT]
    if drift and not args.allow_drift:
        print("✗ refusing to deploy — these are edited on the box and not in git:")
        for remote, _rel, _unit, _s in drift:
            print(f"    {remote}")
        print("\n  capture them first, or pass --allow-drift if you truly mean to overwrite.")
        return 1

    # --allow-drift has to actually INCLUDE the drifted files, not merely stop
    # complaining about them. Shipping only REPO AHEAD while saying "overwriting
    # box edits" would report a successful deploy and change nothing on the box —
    # the precise flavour of quiet lie this script exists to remove.
    todo = [r for r in rows if r[3] == REPO_AHEAD or (args.allow_drift and r[3] == BOX_DRIFT)]
    if args.only:
        todo = [r for r in todo if r[0].rsplit("/", 1)[-1] in set(args.only)]
    if not todo:
        print("✓ nothing to deploy — every managed file already matches the repo")
        return 0

    for remote, rel, _unit, _s in todo:
        if rel.endswith(".py"):
            src = os.path.join(HQ, rel)
            check = subprocess.run([sys.executable, "-c", f"import ast;ast.parse(open({src!r}).read())"])
            if check.returncode != 0:
                print(f"✗ {rel} does not parse — nothing shipped")
                return 1

    stamp = ssh("date +%Y%m%d-%H%M%S").strip()
    units = set()
    for remote, rel, unit, _s in todo:
        ssh(f"cp {remote} {remote}.bak-{stamp} 2>/dev/null")
        subprocess.run(["scp", "-i", KEY, "-q", os.path.join(HQ, rel), f"{HOST}:{remote}"], check=True)
        print(f"  shipped {rel} -> {remote}  (backup {remote}.bak-{stamp})")
        if unit:
            units.add(unit)

    if any(r[0].startswith("/etc/systemd") for r in todo):
        ssh("systemctl daemon-reload")
    for unit in units:
        ssh(f"systemctl restart {unit}")
        print(f"  restarted {unit}")

    # `is-active` is not proof: uvicorn can be up while the app failed to
    # import. Ask it something only a working app can answer.
    health = ssh("sleep 4; curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:8001/health").strip()
    print(f"\n  /health -> {health}")
    if health != "200":
        print("✗ the API is not answering. Roll back with:")
        for remote, _rel, _unit, _s in todo:
            print(f"      ssh {HOST} 'cp {remote}.bak-{stamp} {remote}' && ssh {HOST} 'systemctl restart axe-core-api'")
        return 1
    print("✓ deployed")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check", help="compare box and repo, exit 1 on box drift")
    cap = sub.add_parser("capture", help="pull a box-edited file into its repo path")
    cap.add_argument("names", nargs="+")
    dep = sub.add_parser("deploy", help="ship repo-ahead files, restart, verify")
    dep.add_argument("--only", nargs="+", help="limit to these filenames")
    dep.add_argument("--allow-drift", action="store_true", help="overwrite box edits anyway")
    args = ap.parse_args()
    return {"check": cmd_check, "capture": cmd_capture, "deploy": cmd_deploy}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
