import json

import memory_schrijfhek as hek
from geheimen import VERBORGEN, is_config_sleutel, verberg_geheimen

# Nep, maar in het echte formaat: zo'n string moet eruit.
GH = "ghp_" + "A1b2C3d4" * 5
OPENAI = "sk-proj-" + "x9Y8z7W6" * 5
ANTHROPIC = "sk-ant-api03-" + "Qq1Ww2Ee3" * 4


def test_bekende_sleutels_worden_verborgen():
    for sleutel in (GH, OPENAI, ANTHROPIC, "xai-" + "a1" * 20, "AIza" + "B" * 35):
        uit = verberg_geheimen(f"de sleutel is {sleutel}.")
        assert sleutel not in uit
        assert uit == f"de sleutel is {VERBORGEN}."


def test_een_veld_met_een_naam_ook_zonder_bekend_formaat():
    tekst = json.dumps({"login": "12345", "password": "Hunter2-broker", "id": "axe-core"})
    uit = verberg_geheimen(tekst)
    assert "Hunter2-broker" not in uit
    assert '"login": "12345"' in uit and '"id": "axe-core"' in uit


def test_json_in_json_zoals_saveSetting_het_schrijft():
    # memoryRecorder zet details als JSON in een JSON-string: de aanhalingstekens zijn ge-escaped.
    repos = [{"id": "axe-core", "repo": "AXE-CORE-", "token": GH}]
    waarde = json.dumps({"summary": "axe_github_repos = ...", "value": json.dumps(repos)})
    uit = verberg_geheimen(waarde)
    assert GH not in uit
    assert "AXE-CORE-" in uit
    assert json.loads(json.loads(uit)["value"])[0]["token"] == VERBORGEN


def test_gewone_tekst_blijft_gewoon():
    for tekst in ("task-3f6b6442-c959-47dc-9ad5-7abcdef01234 klaar", "desk-agent lesson XAUUSD", ""):
        assert verberg_geheimen(tekst) == tekst


def test_config_is_de_uitzondering():
    assert is_config_sleutel("cfg:metaapi_config")
    assert not is_config_sleutel("preference:axe_github_repos")
    assert not is_config_sleutel(None)


def test_het_schrijfhek_verbergt_maar_laat_cfg_heel():
    reden, uit = hek.herschrijf("global_memory", {"key": "preference:axe_llm_connections",
                                                  "value": f'{{"openai":"{OPENAI}"}}'})
    assert reden == "ok" and OPENAI not in uit["value"]
    reden, uit = hek.herschrijf("global_memory", {"key": "cfg:metaapi_config",
                                                  "value": '{"token":"eyJabcdefgh.eyJabcdefgh.abcdefgh"}'})
    assert reden == "ok" and "eyJabcdefgh.eyJabcdefgh.abcdefgh" in uit["value"]
    reden, uit = hek.herschrijf("rag_memories", {"content": f"gebruik {GH} voor de push"})
    assert reden == "ok" and GH not in uit["content"]
