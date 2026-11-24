"""Sprint 5 (24 nov): lessen op relevantie, met uitkomst, max 5, met datum en id's."""
import manager_context as mc


def les(i, body, dag="2026-11-2"):
    return {"id": i, "body": body, "created_at": f"{dag}0T10:00:00+00:00", "to_agent": "ervaring"}


RIJEN = [les("a", "# Mislukt: feed repareren. Waarom: 429 van de API-limiet. Volgende keer: eerst API-limiet controleren", "2026-11-1"),
         les("b", "# Werkte: knop kleur aangepast in de UI"),
         les("c", "# Werkte: deal follow-up mail binnen de vaste regel")]


def test_relevante_les_wint_van_de_nieuwste():
    gekozen = mc.kies_lessen(RIJEN, "Repareer de unusualOptions feed, hij geeft 429", n=1)
    assert gekozen[0]["id"] == "a"


def test_uitkomst_versterkt_en_afzwakt():
    assert mc.tel_uitkomsten([{"body": "a good"}, {"body": "a good"}, {"body": "b bad"}, {"body": "rommel"}]) == {"a": 2, "b": -1}
    # een les die vaker schaadde dan hielp valt weg
    assert "b" not in [r["id"] for r in mc.kies_lessen(RIJEN, None, {"b": -2}, n=3)]
    # zonder doel: uitkomst telt, dan de nieuwste
    assert mc.kies_lessen(RIJEN, None, {"c": 1}, n=1)[0]["id"] == "c"


def test_context_noemt_datum_en_vraagt_om_te_verwijzen():
    tekst = mc.bouw_context("trading", [], [], [], [], lessen=RIJEN[:1])
    assert "les van 10 nov" in tekst and "Ik gebruik de les van" in tekst


def test_memory_ref_en_uitkomst_van_begin_tot_eind():
    """Een taak gebruikt een les (memory-ref op de taak), faalt, en die les zakt;
    een volgende taak die slaagt met een andere les laat die stijgen."""
    import agent_loop as al
    import taak_verslag as tv
    from test_manager_betrouwbaar import DB
    db = DB()
    db.rijen["core_tasks"] = [{"id": "t1", "metadata": {"manager": True}}, {"id": "t2", "metadata": {}}]
    al._LESREFS_GEDAAN.clear()
    al._bewaar_lesrefs(db, "t1", ["a", "b"])
    al._bewaar_lesrefs(db, "t1", ["x"])  # één keer per taak
    assert db.rijen["core_tasks"][0]["metadata"]["used_lessons"] == ["a", "b"]
    assert tv.les_uitkomsten(db, {"id": "t1", "metadata": {}}, "failed") == 2
    al._bewaar_lesrefs(db, "t2", ["c"])
    assert tv.les_uitkomsten(db, {"id": "t2", "metadata": {}}, "completed") == 1
    assert tv.les_uitkomsten(db, {"id": "t2", "metadata": {}}, "cancelled") == 0
    tel = mc.tel_uitkomsten([r for r in db.rijen["core_manager_messages"] if r["to_agent"] == "les_uitkomst"])
    assert tel == {"a": -1, "b": -1, "c": 1}
