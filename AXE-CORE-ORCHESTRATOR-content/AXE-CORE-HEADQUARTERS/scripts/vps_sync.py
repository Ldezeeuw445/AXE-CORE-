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
from __future__ import annotations

import argparse
import hashlib
import json
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
    # Missies + DAX (7 okt). De missielus draait in de worker; de API leest mee.
    "/opt/axe-core-api/missies.py": ("backend/axe_api/missies.py", "axe-task-worker"),
    "/opt/axe-core-api/mission_engine.py": ("backend/axe_api/mission_engine.py", "axe-task-worker"),
    "/opt/axe-core-api/dax.py": ("backend/axe_api/dax.py", "axe-task-worker"),
    "/opt/axe-core-api/agent_activiteit.py": ("backend/axe_api/agent_activiteit.py", "axe-core-api"),
    "/opt/axe-core-api/missie_api.py": ("backend/axe_api/missie_api.py", "axe-core-api"),
    "/opt/axe-core-api/browser_agent.py": ("backend/axe_api/browser_agent.py", "axe-core-api"),
    "/opt/axe-core-api/crew_runner.py": ("backend/axe_api/crew_runner.py", "axe-core-api"),
    # main.py importeert dit bij het opstarten. Zonder deze regel ship je
    # main.py zonder zijn module en start de hele API niet meer.
    "/opt/axe-core-api/perplexity_agent.py": ("backend/axe_api/perplexity_agent.py", "axe-core-api"),
    # Deze twee importeert main.py ook, en ze stonden niet in het manifest: zuinig
    # kwam er met de hand op, planner nooit. Een module die main.py nodig heeft en
    # die deploy niet meestuurt is een API die niet opstart -- of, sinds de
    # imports beschermd zijn, een functie die stil ontbreekt.
    "/opt/axe-core-api/zuinig.py": ("backend/axe_api/zuinig.py", "axe-core-api"),
    "/opt/axe-core-api/planner.py": ("backend/axe_api/planner.py", "axe-core-api"),
    "/opt/axe-core-api/abonnement_verbruik.py": ("backend/axe_api/abonnement_verbruik.py", "axe-core-api"),
    "/opt/axe-core-api/cli_laag.py": ("backend/axe_api/cli_laag.py", "axe-core-api"),
    "/opt/axe-core-api/run_crew.py": ("backend/axe_api/run_crew.py", None),
    "/opt/axe-core-api/flow_runner.py": ("infra/axe-core-api/flow_runner.py", "axe-core-api"),
    "/opt/axe-core-api/run_flow.py": ("infra/axe-core-api/run_flow.py", None),
    "/opt/axe-core-api/backend_test.py": ("infra/axe-core-api/backend_test.py", None),
    "/opt/axe-core-api/quick_test.py": ("infra/axe-core-api/quick_test.py", None),
    "/opt/axe-trading/vbt_backtest.py": ("backend/axe_trading/vbt_backtest.py", None),
    "/opt/axe-nautilus/nautilus_backtest.py": ("backend/axe_trading/nautilus_backtest.py", None),
    "/opt/axe-tradingagents/tradingagents_engine.py": ("backend/axe_trading/tradingagents_engine.py", None),
    "/opt/axe-kronos/kronos_forecast.py": ("backend/axe_trading/kronos_forecast.py", None),
    "/opt/axe-core-api/browser_agent_app.py": ("backend/axe_api/browser_agent_app.py", "axe-browser-agent"),
    "/etc/systemd/system/axe-browser-agent.service": ("backend/axe_api/axe-browser-agent.service", "axe-browser-agent"),
    "/etc/systemd/system/axe-core-api.service": ("backend/axe_api/axe-core-api.service", "axe-core-api"),
    "/etc/systemd/system/axe-task-worker.service": ("backend/axe_api/axe-task-worker.service", "axe-task-worker"),
    # main.py importeert planning (de planner-uitvoerder achter /cron/tick). Hij
    # stond niet in het manifest, dus een fix eraan kon nooit worden uitgerold
    # of op drift gecontroleerd (23 sep 2026: de hangende-run-fix).
    "/opt/axe-core-api/planning.py": ("backend/axe_api/planning.py", "axe-core-api"),
    # AXE's stem als terugval (George/Kokoro, lazy). Venv + model: install_vps.sh.
    "/opt/axe-tts/app.py": ("backend/axe_tts/app.py", "axe-tts"),
    "/etc/systemd/system/axe-tts.service": ("backend/axe_tts/axe-tts.service", "axe-tts"),
    # main.py importeert deze bij cron/tick, /approvals en NorthSea-zicht.
    # Zonder deze regels bleef #199 deels op de Mac: de box had de nieuwe
    # modules nooit.
    "/opt/axe-core-api/goedkeuring_melding.py": ("backend/axe_api/goedkeuring_melding.py", "axe-core-api"),
    "/opt/axe-core-api/beslis_beleid.py": ("backend/axe_api/beslis_beleid.py", "axe-core-api"),
    "/opt/axe-core-api/push_meldingen.py": ("backend/axe_api/push_meldingen.py", "axe-core-api"),
    "/opt/axe-core-api/northsea_crew_zichtbaar.py": ("backend/axe_api/northsea_crew_zichtbaar.py", "axe-core-api"),
    # agent_loop importeert deze twee. task_worker importeert agent_loop.
    # Zonder hen in het manifest ship je de worker niet compleet.
    "/opt/axe-core-api/agent_workspace.py": ("backend/axe_api/agent_workspace.py", "axe-task-worker"),
    "/opt/axe-core-api/device_actions.py": ("backend/axe_api/device_actions.py", "axe-task-worker"),
    # main.py importeert deze drie lazy. Ze stonden niet in het manifest: een fix eraan kon nooit worden uitgerold of
    # op drift gecontroleerd (10 okt 2026: de bronworker van Website Review Desk, de LLM-keten en de statusprobe).
    "/opt/axe-core-api/review_desk_bron.py": ("backend/axe_api/review_desk_bron.py", "axe-core-api"),
    "/opt/axe-core-api/llm_cascade.py": ("backend/axe_api/llm_cascade.py", "axe-core-api"),
    "/opt/axe-core-api/provider_probe.py": ("backend/axe_api/provider_probe.py", "axe-core-api"),
    "/opt/axe-core-api/service_probes.py": ("backend/axe_api/service_probes.py", "axe-core-api"),
    # DAX-bots always-on (11 okt 2026): main.py importeert dax_wacht bij de job axe_core:dax-wacht, en
    # dax_wacht leest dax_routine.py als tekst om het in elke DAX-container te zetten.
    "/opt/axe-core-api/dax_wacht.py": ("backend/axe_api/dax_wacht.py", "axe-core-api"),
    "/opt/axe-core-api/dax_routine.py": ("backend/axe_api/dax_routine.py", "axe-core-api"),
    # 24/7 staande diensten (17 okt 2026): main.py importeert staande_diensten bij
    # action_type "staande" en bij elke /cron/tick (zorg_voor_roosters).
    "/opt/axe-core-api/staande_diensten.py": ("backend/axe_api/staande_diensten.py", "axe-core-api"),
    "/opt/axe-core-api/grok_managers.py": ("backend/axe_api/grok_managers.py", "axe-core-api"),
    # 28 okt: de developer-DAX bouwt zoals Grok Bot (task_worker + staande_diensten).
    "/opt/axe-core-api/dax_bouw.py": ("backend/axe_api/dax_bouw.py", "axe-core-api"),
    # Android-poller (#245): main.py mount device_notify (GET /device/notifications).
    "/opt/axe-core-api/device_notify.py": ("backend/axe_api/device_notify.py", "axe-core-api"),
    # Master-prompts van de zes Grok-managers. agent_workspace.master_prompt_voor
    # leest ze als bestand, dus zonder deze regels blijft de identiteit op de box
    # bij de korte _BRIEVEN-zin.
    "/opt/axe-core-api/prompts/axemanager.md": ("backend/axe_api/prompts/axemanager.md", "axe-core-api"),
    "/opt/axe-core-api/prompts/projectsmgr.md": ("backend/axe_api/prompts/projectsmgr.md", "axe-core-api"),
    "/opt/axe-core-api/prompts/companionmgr.md": ("backend/axe_api/prompts/companionmgr.md", "axe-core-api"),
    "/opt/axe-core-api/prompts/axon.md": ("backend/axe_api/prompts/axon.md", "axe-core-api"),
    "/opt/axe-core-api/prompts/tradingos.md": ("backend/axe_api/prompts/tradingos.md", "axe-core-api"),
    "/opt/axe-core-api/prompts/northseamgr.md": ("backend/axe_api/prompts/northseamgr.md", "axe-core-api"),
    # main.py importeert lockscreen voor /lockscreen/snapshot. Zonder deze regel
    # bleef een koersfix in de repo terwijl de box de oude module bleef laden.
    "/opt/axe-core-api/lockscreen.py": ("backend/axe_api/lockscreen.py", "axe-core-api"),
    # main.py importeert twelvedata_budget voor de daglimiet + gedeelde cache.
    "/opt/axe-core-api/twelvedata_budget.py": ("backend/axe_api/twelvedata_budget.py", "axe-core-api"),
    # Router + tierkaart: agent_loop importeert provider_router; zonder deze
    # regels bleef gpt-6-astra/stoelkeuze onzichtbaar voor vps_sync.
    "/opt/axe-core-api/provider_router.py": ("backend/axe_api/provider_router.py", "axe-task-worker"),
    "/opt/axe-core-api/agent_tiers.json": ("backend/axe_api/agent_tiers.json", "axe-task-worker"),
    "/opt/axe-core-api/northsea_desk_handler.py": ("backend/axe_api/northsea_desk_handler.py", "axe-task-worker"),
    "/opt/axe-core-api/taak_fout.py": ("backend/axe_api/taak_fout.py", "axe-core-api"),
    # CORE-SYNC-1 (17 okt 2026): dertien modules die main.py importeert stonden er niet in,
    # gevonden door test_import_sluiting_staat_in_het_manifest. main.py importeert deze
    # tien bij het opstarten (proxy_ai_stream, browser_ai_agents, mcp_hub, northsea*),
    # of via browser_ai_agents. De API draait, dus ze staan op de box; alleen keek
    # niemand of het dezelfde versie was.
    "/opt/axe-core-api/proxy_ai_stream.py": ("backend/axe_api/proxy_ai_stream.py", "axe-core-api"),
    "/opt/axe-core-api/browser_ai_agents.py": ("backend/axe_api/browser_ai_agents.py", "axe-core-api"),
    "/opt/axe-core-api/browser_use_runner.py": ("backend/axe_api/browser_use_runner.py", "axe-core-api"),
    "/opt/axe-core-api/browser_task_store.py": ("backend/axe_api/browser_task_store.py", "axe-core-api"),
    "/opt/axe-core-api/camofox_client.py": ("backend/axe_api/camofox_client.py", "axe-core-api"),
    "/opt/axe-core-api/camofox_runner.py": ("backend/axe_api/camofox_runner.py", "axe-core-api"),
    "/opt/axe-core-api/mcp_hub.py": ("backend/axe_api/mcp_hub.py", "axe-core-api"),
    "/opt/axe-core-api/northsea.py": ("backend/axe_api/northsea.py", "axe-core-api"),
    "/opt/axe-core-api/northsea_gateway.py": ("backend/axe_api/northsea_gateway.py", "axe-core-api"),
    "/opt/axe-core-api/northsea_verstuur.py": ("backend/axe_api/northsea_verstuur.py", "axe-core-api"),
    # Deze drie laadt main.py alleen in een try of achter een omgevingsvariabele. Of ze op
    # de box staan is niet gemeten; daarom ook in OPTIONAL_WHEN_MISSING, zodat deploy ze
    # niet ongevraagd neerzet (agent_runner op de VPS zou /claude/* aanzetten).
    "/opt/axe-core-api/agent_runner.py": ("backend/axe_api/agent_runner.py", "axe-core-api"),
    "/opt/axe-core-api/agent_tunnel.py": ("backend/axe_api/agent_tunnel.py", "axe-core-api"),
    "/opt/axe-core-api/trading_cockpit.py": ("backend/axe_api/trading_cockpit.py", "axe-core-api"),
    # CORE-HEALTH-1: /health meet de afhankelijkheden (Supabase, tick, worker, northsea-mcp).
    "/opt/axe-core-api/gezondheid.py": ("backend/axe_api/gezondheid.py", "axe-core-api"),
    "/opt/axe-core-api/memory_schrijfhek.py": ("backend/axe_api/memory_schrijfhek.py", "axe-core-api"),
    # main.py, het schrijfhek en cli_laag verbergen er sleutels mee (30 okt). Zonder deze
    # regel startte de API niet: 58dae2e3 en 6468bb40 werden teruggedraaid op /health 000.
    "/opt/axe-core-api/geheimen.py": ("backend/axe_api/geheimen.py", "axe-core-api"),
    # /ollama/* naar de modelbox, zodat geen toestel een eigen Ollama-sleutel nodig heeft (30 okt).
    "/opt/axe-core-api/modelbox.py": ("backend/axe_api/modelbox.py", "axe-core-api"),
    # Fase 2 (#255-#257): main.py laadt hem in een try voor /orchestrator/*; zonder deze
    # regel gaf dat endpoint "not deployed" en hield de importsluiting-test de deploy tegen.
    "/opt/axe-core-api/orchestrator_lus.py": ("backend/axe_api/orchestrator_lus.py", "axe-core-api"),
    # planner importeert dit na een geslaagde bouwrun (draft-PR); de bouwlus draait op de
    # Mac, maar planner.py staat op de box, dus zijn module ook.
    "/opt/axe-core-api/bouw_publiceer.py": ("backend/axe_api/bouw_publiceer.py", "axe-core-api"),
    # Usage & Credits (plan B stap 1): main.py importeert usage_credits in
    # GET /usage-credits. Zonder deze regel blijft de module op de Mac.
    "/opt/axe-core-api/usage_credits.py": ("backend/axe_api/usage_credits.py", "axe-core-api"),
}

# MISSING op de box, en de bijbehorende dienst staat er niet (of is optioneel).
# `deploy` slaat ze over tenzij je ze met --only bij naam noemt.
OPTIONAL_WHEN_MISSING = {
    "/opt/axe-tts/app.py",
    "/etc/systemd/system/axe-tts.service",
    "/opt/axe-core-api/cli_laag.py",
    "/opt/axe-core-api/agent_runner.py",
    "/opt/axe-core-api/agent_tunnel.py",
    "/opt/axe-core-api/trading_cockpit.py",
}

# Wie wie nodig heeft. Ship je de één zonder de ander, dan start de worker niet.
WORKER_IMPORTS = {
    "task_worker.py": ("agent_loop.py", "task_runtime.py", "missies.py", "mission_engine.py", "dax.py", "northsea_desk_handler.py", "dax_bouw.py", "bouw_publiceer.py"),
    "agent_loop.py": ("device_actions.py", "agent_workspace.py", "beslis_beleid.py", "provider_router.py"),
    "main.py": ("missie_api.py", "missies.py", "agent_activiteit.py", "dax.py", "service_probes.py", "abonnement_verbruik.py", "dax_wacht.py", "dax_routine.py", "staande_diensten.py", "grok_managers.py", "taak_fout.py", "gezondheid.py", "memory_schrijfhek.py", "geheimen.py", "device_notify.py", "modelbox.py"),
    "memory_schrijfhek.py": ("geheimen.py",),
    "staande_diensten.py": ("grok_managers.py", "dax_bouw.py"),
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


def naam_van(remote: str) -> str:
    return remote.rsplit("/", 1)[-1]


def deploy_kandidaten(
    rows: list,
    *,
    only: list[str] | None = None,
    allow_drift: bool = False,
    geinstalleerd: set[str] | None = None,
) -> tuple[list, list]:
    """Welke rijen shippen, en welke MISSING we expres overslaan."""
    only_set = set(only) if only else None
    todo, overgeslagen = [], []
    for remote, rel, unit, state in rows:
        name = naam_van(remote)
        if only_set is not None and name not in only_set:
            continue
        if state not in (REPO_AHEAD, MISSING) and not (allow_drift and state == BOX_DRIFT):
            continue
        if state == MISSING and only_set is None:
            if remote in OPTIONAL_WHEN_MISSING:
                overgeslagen.append((remote, "optional-missing"))
                continue
            if unit and geinstalleerd is not None and unit not in geinstalleerd:
                overgeslagen.append((remote, "unit-not-installed"))
                continue
        todo.append((remote, rel, unit, state))
    return todo, overgeslagen


def aanwezig_namen(rows: list, extra: set[str] | None = None) -> set[str]:
    """Bestanden die op de box staan of in deze ronde meegaan."""
    namen = set(extra or ())
    for remote, _rel, _unit, state in rows:
        if state != MISSING:
            namen.add(naam_van(remote))
    return namen


def ontbrekende_worker_imports(todo_namen: set[str], aanwezig: set[str]) -> list[str]:
    """Ship je agent_loop/task_worker, dan moeten hun imports er óók zijn."""
    nodig: set[str] = set()
    stack = [n for n in todo_namen if n in WORKER_IMPORTS]
    while stack:
        naam = stack.pop()
        for dep in WORKER_IMPORTS.get(naam, ()):
            if dep in nodig:
                continue
            nodig.add(dep)
            if dep in WORKER_IMPORTS:
                stack.append(dep)
    gezien = set(aanwezig) | set(todo_namen)
    return sorted(dep for dep in nodig if dep not in gezien)


def geinstalleerde_eenheden() -> set[str]:
    """Unit-namen (zonder .service) die systemd op de box kent."""
    out = ssh("systemctl list-unit-files --type=service --no-legend --no-pager")
    namen: set[str] = set()
    for regel in out.splitlines():
        stuk = (regel.split() or [""])[0]
        if stuk.endswith(".service"):
            namen.add(stuk[: -len(".service")])
        elif stuk:
            namen.add(stuk)
    return namen


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
    # MISSING ships too, and leaving it out was a hole in this tool. A file the
    # box has never seen is the one case where there is provably nothing to
    # destroy, yet `deploy` answered "nothing to deploy — every managed file
    # already matches the repo" and shipped nothing. Adding the Kronos engine
    # hit it immediately: the guard reported MISSING in `check` and then
    # refused to act on its own finding.
    #
    # Uitzondering: optionele diensten die op deze box nooit geïnstalleerd zijn
    # (axe-tts, cli_laag). Die MISSING-rijen overslaan, tenzij --only ze noemt.
    geinstalleerd = geinstalleerde_eenheden()
    todo, overgeslagen = deploy_kandidaten(
        rows,
        only=args.only,
        allow_drift=args.allow_drift,
        geinstalleerd=geinstalleerd,
    )
    for remote, reden in overgeslagen:
        print(f"  skip {naam_van(remote)}  ({reden})")
    if not todo:
        print("✓ nothing to deploy — every managed file already matches the repo")
        return 0

    worker_mist = ontbrekende_worker_imports(
        {naam_van(r[0]) for r in todo},
        aanwezig_namen(rows, {naam_van(r[0]) for r in todo}),
    )
    if worker_mist:
        print("✗ refusing to ship agent_loop/task_worker without their imports:")
        for regel in worker_mist:
            print(f"    {regel}")
        return 1

    for remote, rel, _unit, _s in todo:
        if rel.endswith(".py"):
            src = os.path.join(HQ, rel)
            check = subprocess.run([sys.executable, "-c", f"import ast;ast.parse(open({src!r}).read())"])
            if check.returncode != 0:
                print(f"✗ {rel} does not parse — nothing shipped")
                return 1

    stamp, _units = verzend(todo)
    health = gezondheid()
    print(f"\n  /health -> {health}")
    if health != "200":
        print("✗ the API is not answering. Roll back with:")
        for remote, _rel, _unit, _s in todo:
            print(f"      ssh {HOST} 'cp {remote}.bak-{stamp} {remote}' && ssh {HOST} 'systemctl restart axe-core-api'")
        return 1
    print("✓ deployed")
    return 0


def verzend(todo: list) -> tuple[str, set]:
    """Backup, kopie, herstart. Geeft de stempel van de backups en de units."""
    stamp = ssh("date +%Y%m%d-%H%M%S").strip()
    units = set()
    for remote, rel, unit, _s in todo:
        ssh(f"mkdir -p {os.path.dirname(remote)}")
        ssh(f"cp {remote} {remote}.bak-{stamp} 2>/dev/null")
        subprocess.run(["scp", "-i", KEY, "-q", os.path.join(HQ, rel), f"{HOST}:{remote}"], check=True)
        print(f"  shipped {rel} -> {remote}  (backup {remote}.bak-{stamp})")
        if unit:
            units.add(unit)
    if any(r[0].startswith("/etc/systemd") for r in todo):
        ssh("systemctl daemon-reload")
    for unit in sorted(units):
        ssh(f"systemctl restart {unit}")
        print(f"  restarted {unit}")
    return stamp, units


def gezondheid() -> str:
    # `is-active` is not proof: uvicorn can be up while the app failed to
    # import. Ask it something only a working app can answer.
    return ssh("sleep 4; curl -s -o /dev/null -w '%{http_code}' --max-time 10 http://127.0.0.1:8001/health").strip()


def terugzetten(todo: list, stamp: str, units: set) -> None:
    """Alles van deze ronde terug: de backup terug, of weg als het bestand nieuw was."""
    for remote, _rel, _unit, _s in todo:
        ssh(f"if [ -f {remote}.bak-{stamp} ]; then cp {remote}.bak-{stamp} {remote}; else rm -f {remote}; fi")
    if any(r[0].startswith("/etc/systemd") for r in todo):
        ssh("systemctl daemon-reload")
    for unit in sorted(units):
        ssh(f"systemctl restart {unit}")


# ── auto: de Macs zetten zelf live (Luka, 28 okt: "ja auto deploy") ──────────
#
# Tot 28 okt was deze uitrol een handeling van Luka, en die bleef liggen terwijl
# hij ziek was: vijf commits stonden een dag op orchestrator en niet op de VPS.
# `auto` draait vanuit axe-autosync.sh (elke 5 minuten, op de Mac met de
# VPS-sleutel) en zet alleen live als:
#   * er niets met de hand op de box is veranderd (BOX DRIFT = nooit);
#   * de backendtests op deze Mac groen zijn;
#   * geen andere Mac op dat moment uitrolt (slot op de VPS).
# Faalt /health daarna, dan gaat alles van die ronde vanzelf terug.
SLOT = "/tmp/axe-vps-sync.lock"
STAAT = os.path.expanduser(os.environ.get("AXE_AUTO_DEPLOY_STAAT", "~/.axe/auto-deploy.json"))


def auto_besluit(rows: list, todo: list, tests: bool | None) -> tuple[str, str]:
    """("niets" | "geweigerd" | "deploy", reden). Puur, zodat het te testen is."""
    if not todo:
        return "niets", "every managed file already matches the repo"
    drift = [naam_van(r[0]) for r in rows if r[3] == BOX_DRIFT]
    if drift:
        return "geweigerd", "edited on the box and not in git: " + ", ".join(drift[:5])
    if tests is None:
        return "geweigerd", "no test environment on this Mac (pytest + backend requirements)"
    if tests is False:
        return "geweigerd", "backend tests are red on this Mac"
    return "deploy", "box matches git, tests green"


TEST_VENV = os.path.expanduser(os.environ.get("AXE_TEST_VENV", "~/.axe/test-venv"))
# Wat in een testomgeving niet hoeft en op een Mac soms niet bouwt (http-ece is
# C); geen test importeert het.
NIET_VOOR_TESTS = ("pywebpush", "http-ece", "http_ece", "browser-use")
# launchd geeft de autosync alleen /usr/bin:/bin:/usr/sbin:/sbin. Daar staat op
# een Mac Python 3.9 en geen uv (29 okt, iMac: "no Python 3.11+"), terwijl de
# app-bouw ze wel heeft. Dus ook op de vaste plekken kijken.
_MAC_BIN = ("/opt/homebrew/bin", "/usr/local/bin", os.path.expanduser("~/.local/bin"),
            os.path.expanduser("~/.cargo/bin"))


def _bruikbaar(py: str) -> bool:
    ok = subprocess.run([py, "-c", "import pytest, fastapi, httpx"], capture_output=True, check=False)
    return ok.returncode == 0


def _uv() -> str | None:
    import shutil
    gevonden = shutil.which("uv")
    if gevonden:
        return gevonden
    return next((os.path.join(d, "uv") for d in _MAC_BIN if os.access(os.path.join(d, "uv"), os.X_OK)), None)


def _basis_python() -> str | None:
    """Een Python van 3.11 of nieuwer; de backend gebruikt `X | None` in modellen."""
    namen = ["python3.13", "python3.12", "python3.11"]
    namen += [os.path.join(d, n) for d in _MAC_BIN for n in ("python3.13", "python3.12", "python3.11", "python3")]
    namen += [f"/Library/Frameworks/Python.framework/Versions/3.{m}/bin/python3" for m in (13, 12, 11)]
    # De runtime die de app-bouw met uv neerzet (run-local.sh) is 3.12; als basis is hij goed.
    namen += [os.path.join(HQ, "backend", "axe_api", ".venv-local", "bin", "python"), "python3"]
    for naam in namen:
        p = subprocess.run([naam, "-c", "import sys; print(sys.version_info >= (3, 11))"],
                           capture_output=True, text=True, check=False) if _op_pad(naam) else None
        if p is not None and p.returncode == 0 and p.stdout.strip() == "True":
            return naam
    return None


def _op_pad(naam: str) -> bool:
    import shutil
    return bool(os.path.exists(naam) or shutil.which(naam))


def maak_test_venv() -> tuple[str | None, str]:
    """~/.axe/test-venv, eenmalig, en opnieuw als requirements.txt verandert.

    28 okt: de eerste auto-deploy op de iMac wachtte met "no test environment on
    this Mac". Zonder groene tests rolt auto terecht niet uit; dus zet hij die
    omgeving zelf neer in plaats van erop te wachten.
    """
    req = os.path.join(HQ, "backend", "axe_api", "requirements.txt")
    try:
        with open(req, "rb") as fh:
            inhoud = fh.read()
    except OSError:
        return None, "requirements.txt not found"
    vinger = hashlib.sha256(inhoud).hexdigest()[:16]
    py = os.path.join(TEST_VENV, "bin", "python")
    merk = os.path.join(TEST_VENV, ".requirements")
    try:
        with open(merk) as fh:
            klaar = fh.read().strip() == vinger
    except OSError:
        klaar = False
    if klaar and os.path.exists(py) and _bruikbaar(py):
        return py, ""
    uv = _uv()
    if not os.path.exists(py):
        if uv:
            # uv haalt zelf een 3.12 als de Mac er geen heeft, net als run-local.sh.
            maak = [uv, "venv", "--python", "3.12", TEST_VENV]
        else:
            basis = _basis_python()
            if not basis:
                return None, "no Python 3.11+ and no uv on this Mac (brew install uv)"
            maak = [basis, "-m", "venv", TEST_VENV]
        if subprocess.run(maak, capture_output=True, timeout=600, check=False).returncode != 0:
            return None, "could not create the test venv"
    regels = [r for r in inhoud.decode("utf-8", "replace").splitlines()
              if r.strip() and not r.strip().startswith("#")
              and not any(r.strip().lower().startswith(n) for n in NIET_VOOR_TESTS)]
    gefilterd = os.path.join(TEST_VENV, "requirements-tests.txt")
    with open(gefilterd, "w") as fh:
        fh.write("\n".join(regels) + "\npytest\npytest-asyncio\n")
    # Een uv-venv heeft geen pip; uv installeert dan zelf.
    installeer = ([uv, "pip", "install", "-q", "--python", py, "-r", gefilterd] if uv
                  else [py, "-m", "pip", "install", "-q", "-r", gefilterd])
    p = subprocess.run(installeer, capture_output=True, text=True, timeout=1800, check=False)
    if p.returncode != 0 or not _bruikbaar(py):
        return None, "pip install for the test venv failed: " + (p.stderr or p.stdout or "")[-200:]
    with open(merk, "w") as fh:
        fh.write(vinger)
    return py, ""


def test_python() -> tuple[str | None, str]:
    for kandidaat in (os.environ.get("AXE_TEST_PYTHON"),
                      os.path.join(HQ, "backend", "axe_api", ".venv-local", "bin", "python"),
                      sys.executable):
        if kandidaat and os.path.exists(kandidaat) and _bruikbaar(kandidaat):
            return kandidaat, ""
    return maak_test_venv()


def draai_tests() -> tuple[bool | None, str]:
    py, waarom = test_python()
    if not py:
        return None, waarom
    # Zonder sleutels: een test mag nooit per ongeluk een echte dienst raken.
    schoon = {k: v for k, v in os.environ.items()
              if not k.startswith(("SUPABASE", "AXE_", "GITHUB", "GH_", "OPENAI", "GROQ", "ANTHROPIC",
                                   "XAI", "GEMINI", "CEREBRAS", "OLLAMA", "STRIPE", "METAAPI"))}
    p = subprocess.run([py, "-m", "pytest", "-q", "-p", "no:cacheprovider"], cwd=os.path.join(HQ, "backend", "axe_api"),
                       capture_output=True, text=True, timeout=1800, env=schoon, check=False)
    staart = (p.stdout or "")[-1200:] + (p.stderr or "")[-300:]
    if p.returncode != 0:
        return False, staart
    # Ook het manifest zelf: een nieuwe module die main.py importeert maar hier ontbreekt,
    # start de API niet (30 okt, geheimen.py). Dat hoort de deploy tegen te houden, niet
    # pas de terugval na /health 000.
    m = subprocess.run([py, "-m", "pytest", "-q", "-p", "no:cacheprovider", "scripts/test_vps_sync.py"], cwd=HQ,
                       capture_output=True, text=True, timeout=300, env=schoon, check=False)
    return m.returncode == 0, staart if m.returncode == 0 else (m.stdout or "")[-1200:] + (m.stderr or "")[-300:]


def _schrijf_staat(uitkomst: dict) -> None:
    try:
        os.makedirs(os.path.dirname(STAAT), exist_ok=True)
        with open(STAAT, "w") as fh:
            json.dump(uitkomst, fh, indent=2)
    except OSError as e:
        print(f"  (could not write {STAAT}: {e})", file=sys.stderr)


def _lees_staat() -> dict:
    try:
        with open(STAAT) as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return {}


def meld(uitkomst: dict, vorige: dict) -> None:
    """Eén core_notifications-rij per nieuwe uitkomst, nooit dezelfde twee keer."""
    if uitkomst.get("actie") == "niets":
        return
    sleutel = f"{uitkomst.get('actie')}|{uitkomst.get('reden')}|{uitkomst.get('commit')}"
    if vorige.get("gemeld") == sleutel:
        uitkomst["gemeld"] = sleutel
        return
    url, sleutel_sb = os.environ.get("SUPABASE_URL", ""), (os.environ.get("SUPABASE_SERVICE_ROLE")
                                                           or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or "")
    if not url or not sleutel_sb:
        return
    soort = {"gedeployd": "success", "teruggezet": "error"}.get(uitkomst["actie"], "warning")
    tekst = {
        "gedeployd": f"AXE Core API updated on the VPS ({uitkomst.get('commit')}): "
                     + ", ".join(uitkomst.get("bestanden") or []),
        "teruggezet": f"AXE Core API update {uitkomst.get('commit')} rolled back: /health answered "
                      f"{uitkomst.get('health')}. The previous version runs again.",
    }.get(uitkomst["actie"], f"AXE Core API update waits: {uitkomst.get('reden')}.")
    import urllib.request
    req = urllib.request.Request(
        url.rstrip("/") + "/rest/v1/core_notifications", method="POST",
        data=json.dumps({"type": soort, "message": tekst[:1900]}).encode(),
        headers={"apikey": sleutel_sb, "Authorization": f"Bearer {sleutel_sb}",
                 "Content-Type": "application/json", "Prefer": "return=minimal"})
    try:
        urllib.request.urlopen(req, timeout=15)
        uitkomst["gemeld"] = sleutel
    except Exception as e:  # noqa: BLE001 — melden mag de uitrol niet breken
        print(f"  (notification not sent: {type(e).__name__})", file=sys.stderr)


def cmd_auto(_args) -> int:
    if os.environ.get("AXE_AUTO_DEPLOY", "1").strip() == "0" or os.path.exists(os.path.expanduser("~/.axe/auto-deploy-uit")):
        return 0
    vorige = _lees_staat()
    commit = subprocess.run(["git", "-C", HQ, "rev-parse", "--short", "HEAD"], capture_output=True, text=True,
                            check=False).stdout.strip()
    # Dezelfde commit geeft dezelfde tests: niet elke 5 minuten opnieuw rood draaien
    # (en niet elke 5 minuten dezelfde regel in het log). Een nieuwe commit probeert opnieuw.
    # Alleen bij rode tests of een terugzetting: een ontbrekende testomgeving of
    # een slot van de andere Mac lost zichzelf op en wordt gewoon opnieuw geprobeerd.
    if vorige.get("commit") == commit and (vorige.get("actie") == "teruggezet" or (
            vorige.get("actie") == "geweigerd" and "tests are red" in str(vorige.get("reden")))):
        return 0
    try:
        rows = survey()
        todo, _skip = deploy_kandidaten(rows, geinstalleerd=geinstalleerde_eenheden())
    except Exception as e:  # noqa: BLE001 — geen VPS-toegang vanaf deze Mac
        _schrijf_staat({**vorige, "laatst": commit, "actie": "niets", "reden": f"no VPS access: {type(e).__name__}"})
        return 0
    worker_mist = ontbrekende_worker_imports(
        {naam_van(r[0]) for r in todo}, aanwezig_namen(rows, {naam_van(r[0]) for r in todo})) if todo else []
    if worker_mist:
        actie, reden = "geweigerd", "worker imports missing from the manifest: " + "; ".join(worker_mist[:3])
        tests, staart = None, ""
    else:
        tests, staart = (draai_tests() if todo and not [r for r in rows if r[3] == BOX_DRIFT] else (True, ""))
        actie, reden = auto_besluit(rows, todo, tests)
        if tests is None and staart:
            reden = f"{reden}: {staart[:200]}"
    uitkomst = {"commit": commit, "actie": actie, "reden": reden,
                "bestanden": [naam_van(r[0]) for r in todo], "tests": staart[-600:]}
    if actie == "deploy":
        if ssh(f"mkdir {SLOT} 2>/dev/null && echo ok || (find {SLOT} -maxdepth 0 -mmin +30 -exec rm -rf {{}} \\; ; echo bezet)").strip() != "ok":
            print("another Mac is deploying; next round")
            return 0
        try:
            stamp, units = verzend(todo)
            health = gezondheid()
            uitkomst["health"] = health
            if health == "200":
                uitkomst["actie"] = "gedeployd"
                print(f"✓ auto-deployed {commit}")
            else:
                terugzetten(todo, stamp, units)
                uitkomst["actie"] = "teruggezet"
                print(f"✗ /health {health} after the update; rolled back")
        finally:
            ssh(f"rm -rf {SLOT}")
    elif actie == "geweigerd":
        print(f"✗ auto-deploy waits: {reden}")
    meld(uitkomst, vorige)
    _schrijf_staat(uitkomst)
    return 0 if uitkomst["actie"] in ("niets", "gedeployd") else 1


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check", help="compare box and repo, exit 1 on box drift")
    cap = sub.add_parser("capture", help="pull a box-edited file into its repo path")
    cap.add_argument("names", nargs="+")
    dep = sub.add_parser("deploy", help="ship repo-ahead files, restart, verify")
    dep.add_argument("--only", nargs="+", help="limit to these filenames")
    dep.add_argument("--allow-drift", action="store_true", help="overwrite box edits anyway")
    sub.add_parser("auto", help="for axe-autosync: deploy only with a clean box and green tests, roll back on a bad /health")
    args = ap.parse_args()
    return {"check": cmd_check, "capture": cmd_capture, "deploy": cmd_deploy, "auto": cmd_auto}[args.cmd](args)


if __name__ == "__main__":
    sys.exit(main())
