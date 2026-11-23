"""Kilo/OpenCode headless: schrijven met --auto, plan zonder (23 nov, Planner-fout)."""
from agent_runner import _free_cmd


def test_schrijven_krijgt_auto():
    for naam in ("kilo", "opencode"):
        cmd = _free_cmd(naam)(naam, "doe iets", "write", None)
        assert "--auto" in cmd
        assert cmd[-1] == "doe iets" and cmd[-2] == "--"


def test_plan_blijft_zonder_auto():
    for naam in ("kilo", "opencode"):
        cmd = _free_cmd(naam)(naam, "kijk", "plan", None)
        assert "--auto" not in cmd
        assert cmd[cmd.index("--agent") + 1] == "plan"
