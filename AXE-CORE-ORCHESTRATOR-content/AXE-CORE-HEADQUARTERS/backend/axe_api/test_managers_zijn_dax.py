"""26 nov (ADR managers-zijn-dax): één agent per app -- de manager ÍS de DAX-bot."""
import agent_workspace as aw

MANAGERS = ("axemanager", "projectsmgr", "companionmgr", "axon", "tradingos", "northseamgr")


def test_elke_manager_heeft_een_eigen_dax_computer_en_geen_twee_delen_er_een():
    dax = {m: aw.dax_voor(aw.laad_workspace(m)) for m in MANAGERS}
    assert all(dax.values()), dax
    assert len(set(dax.values())) == len(MANAGERS)
    assert dax["northseamgr"] == "dax-northsea-01" and dax["tradingos"] == "dax-trading-01"
    assert dax["axemanager"] == "dax-thinktank-01" and dax["projectsmgr"] == "dax-developer-01"


def test_crew_en_grenzen_gaan_mee():
    assert aw.crew_voor(aw.laad_workspace("axemanager")) == ["nova", "atlas"]
    assert aw.crew_voor(aw.laad_workspace("projectsmgr")) == ["wags", "forge"]
    # 28 nov: Trading OS Manager kan alles, net als AXE CORE en Projects (crew incl.).
    assert aw.laad_workspace("tradingos")["tools"] == aw.laad_workspace("axemanager")["tools"]
    assert "write_file" in aw.laad_workspace("tradingos")["tools"]


def test_oude_botnamen_zijn_aliassen_en_browser_is_geen_agent_meer():
    assert aw.manager_voor("northsea") == "northseamgr"
    assert aw.manager_voor("developer") == "projectsmgr"
    assert aw.manager_voor("axemanager") == "axemanager"
    assert "browser" not in aw.MANAGER_VAN_DAX_BOT
    assert aw.GEDEELDE_BROWSER_DAX == "dax-browser-01"


def test_vps_werk_blijft_op_de_vps():
    assert aw.draait_op_dax({"title": "NorthSea Desk Manager: zoek drie kopers voor EN590", "goal": "", "metadata": {}})
    assert not aw.draait_op_dax({"title": "x", "goal": "", "metadata": {"eigen_ronde": True}})
    assert not aw.draait_op_dax({"title": "AXE CORE Manager: herstart axe-task-worker", "goal": "", "metadata": {}})
    assert not aw.draait_op_dax({"title": "kijk naar systemctl status nginx", "goal": "", "metadata": {}})
    assert not aw.draait_op_dax({"title": "x", "goal": "", "metadata": {"pinned_device": "vps"}})
