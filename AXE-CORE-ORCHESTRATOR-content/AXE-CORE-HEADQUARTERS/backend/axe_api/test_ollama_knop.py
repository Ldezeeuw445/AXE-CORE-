import asyncio

import modelbox


def test_alleen_status_en_restart():
    uit = asyncio.run(modelbox.ollama_knop("rm -rf /"))
    assert uit["ok"] is False and "alleen" in uit["uitvoer"]


def test_lijst_is_smal():
    assert modelbox.OLLAMA_KNOP == ("status", "restart")
