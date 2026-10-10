"""De bronworker van Website Review Desk: limieten, ontdubbelen, rapportupdate en een volledige run."""
import copy
import json
from datetime import datetime, timedelta, timezone

import httpx

import review_desk_bron as rd

NU = datetime(2026, 10, 12, 10, 0, tzinfo=timezone.utc)      # maandag 12:00 Amsterdam, binnen het venster
EIGEN = {"support@axeheadquarters.com", "axeheadquarters.com"}


def rapport():
    t = "2026-10-10T15:29:34.634Z"
    return {
        "schemaVersion": 1, "updatedAt": t, "summary": "x",
        "metrics": [
            {"label": "Proposals sent", "value": 7, "unit": "count", "asOf": t, "source": "ChatGPT"},
            {"label": "Website inquiries", "value": 0, "unit": "count", "asOf": t, "source": "ChatGPT"},
            {"label": "Recorded payment events", "value": 0, "unit": "count", "asOf": t, "source": "ChatGPT"},
            {"label": "Published social posts", "value": 1, "unit": "count", "asOf": t, "source": "ChatGPT"},
            {"label": "TikTok video views", "value": 8, "unit": "count", "asOf": t, "source": "ChatGPT"},
            {"label": "Received at last check", "value": 0, "unit": "EUR", "asOf": t, "source": "ChatGPT"},
        ],
        "leads": [], "channels": [{"name": "Gmail", "status": "oud", "asOf": t}],
        "sections": [{"title": "Bron-ID’s en deduplicatie", "asOf": t, "body": "Niet opnieuw tellen:\ninfo@webnomad.nl: message/thread 1a11514d4f019d32\ninfo@wearenew.nl: message/thread 1a10b5c28cc5ad63\n"}],
        "actions": ["Mensen-actie"], "links": [{"label": "Site", "url": "https://example.com"}],
    }


# ── Een nagebootste opslag met CAS ──────────────────────────────────────────────────────────────────────
class Opslag:
    def __init__(self, snap=None, botsing_eerste=False):
        self.rijen = {rd.RAPPORT_SLEUTEL: rd.Rij("u1", snap or rapport(), "2026-10-10T16:30:00.230539+00:00")}
        self.botsing_eerste = botsing_eerste
        self.schrijfacties = []

    def lees(self, sleutel, user_id=None):
        r = self.rijen.get(sleutel)
        return rd.Rij(r.user_id, copy.deepcopy(r.value), r.updated_at) if r else None

    def schrijf_cas(self, user_id, sleutel, waarde, verwacht):
        r = self.rijen[sleutel]
        if self.botsing_eerste and sleutel == rd.RAPPORT_SLEUTEL:
            self.botsing_eerste = False
            # Een andere schrijver was net eerder: zijn versie heeft een nieuwere updated_at.
            r.updated_at = "2026-10-12T10:00:00.000000+00:00"
            r.value["actions"].append("Door ChatGPT toegevoegd")
        if r.updated_at != verwacht:
            return None
        nieuw = f"2026-10-12T10:00:{len(self.schrijfacties) + 1:02d}.000000+00:00"
        self.rijen[sleutel] = rd.Rij(user_id, copy.deepcopy(waarde), nieuw)
        self.schrijfacties.append(sleutel)
        return nieuw

    def maak(self, user_id, sleutel, waarde):
        self.rijen[sleutel] = rd.Rij(user_id, copy.deepcopy(waarde), "2026-10-12T10:00:00.000000+00:00")
        self.schrijfacties.append(sleutel)
        return True


ALLE = {
    "GOOGLE_OAUTH_CLIENT_ID": "id", "GOOGLE_OAUTH_CLIENT_SECRET": "geheim", "REVIEW_DESK_GMAIL_REFRESH_TOKEN": "rt",
    "REVIEW_DESK_STRIPE_KEY": "rk_live_abc", "REVIEW_DESK_SITES_URL": "https://sites.example/api", "REVIEW_DESK_SITES_TOKEN": "t",
    "METRICOOL_USER_TOKEN": "mt", "METRICOOL_USER_ID": "42", "METRICOOL_BLOG_ID": "7244586",
}


class Wereld:
    """De vier bronnen als één MockTransport; legt elk verzoek vast zodat we kunnen bewijzen wat NIET gebeurt."""

    def __init__(self):
        self.verzoeken = []
        self.gmail_berichten = {}
        self.gmail_pagina_kopje = 0
        self.stripe_sessies = []
        self.stripe_status = 200
        self.sites = {"inquiries": [], "payment_events": []}
        self.posts = []
        self.tiktok = []
        self.gmail_lijst_extra = None

    def client(self):
        return httpx.Client(transport=httpx.MockTransport(self.handler))

    def handler(self, req: httpx.Request) -> httpx.Response:
        self.verzoeken.append((req.method, str(req.url)))
        u = req.url
        if u.host == "oauth2.googleapis.com":
            return httpx.Response(200, json={"access_token": "at"})
        if u.host == "gmail.googleapis.com":
            pad = u.path.split("/users/me/")[1]
            if pad == "messages":
                q = u.params.get("q", "")
                if self.gmail_lijst_extra is not None:
                    pagina = int(u.params.get("pageToken") or 0)
                    ids = [f"m{pagina}-{i}" for i in range(rd.PAGINA_GROOTTE)]
                    return httpx.Response(200, json={"messages": [{"id": i} for i in ids], "nextPageToken": str(pagina + 1)})
                ids = [i for i, m in self.gmail_berichten.items() if (("in:sent" in q and "SENT" in m["labelIds"]) or ("in:inbox" in q and "INBOX" in m["labelIds"]) or ("mailer-daemon" in q and "BOUNCE" in m["labelIds"]))]
                return httpx.Response(200, json={"messages": [{"id": i} for i in ids]})
            m = self.gmail_berichten.get(pad.split("/")[1])
            if self.gmail_lijst_extra is not None:
                m = {"threadId": "t", "labelIds": ["INBOX"], "snippet": "", "internalDate": "1760000000000", "payload": {"headers": []}}
            return httpx.Response(200, json=m)
        if u.host == "api.stripe.com":
            if self.stripe_status != 200:
                return httpx.Response(self.stripe_status, json={"error": {"message": "Invalid API Key provided"}})
            return httpx.Response(200, json={"data": self.stripe_sessies, "has_more": False})
        if u.host == "sites.example":
            verz = u.path.rsplit("/", 1)[1]
            return httpx.Response(200, json={"rows": self.sites[verz], "next_offset": None})
        if u.host == "app.metricool.com":
            if "scheduler/posts" in u.path:
                return httpx.Response(200, json={"data": self.posts})
            return httpx.Response(200, json={"data": self.tiktok})
        return httpx.Response(404)


def bericht(i, labels, van, aan="", onderwerp="Hoi", snippet="", thread=None, ms=1760000000000, extra=None):
    h = [{"name": "From", "value": van}, {"name": "To", "value": aan}, {"name": "Subject", "value": onderwerp}] + (extra or [])
    return i, {"id": i, "threadId": thread or f"t-{i}", "labelIds": labels, "snippet": snippet, "internalDate": str(ms), "payload": {"headers": h}}


# ── Sleutels ────────────────────────────────────────────────────────────────────────────────────────────
def test_sleutels_omgeving_voor_kluis_alleen_toegestane_namen(tmp_path):
    kluis = tmp_path / "secrets.env"
    kluis.write_text("METRICOOL_USER_TOKEN=uit-kluis\nREVIEW_DESK_STRIPE_KEY=rk_live_kluis\nSTRIPE_SECRET_KEY=sb_secret_fout\nOPENAI_API_KEY=nee\n")
    s = rd.laad_sleutels({"METRICOOL_USER_TOKEN": "uit-env", "METRICOOL_USER_ID": ""}, str(kluis))
    assert s["METRICOOL_USER_TOKEN"] == "uit-env"
    assert s["REVIEW_DESK_STRIPE_KEY"] == "rk_live_kluis"
    assert "STRIPE_SECRET_KEY" not in s and "OPENAI_API_KEY" not in s     # bewust nooit gelezen
    assert "METRICOOL_USER_ID" not in s                                      # een lege waarde telt niet
    assert s["METRICOOL_BLOG_ID"] == "7244586"                               # bekende standaard


def test_een_supabase_sleutel_is_geen_stripe_sleutel_en_een_volledige_sleutel_is_te_ruim():
    assert not rd.stripe_sleutel_geldig("sb_secret_Oq3abc")[0]
    assert not rd.stripe_sleutel_geldig("sk_live_abc")[0]
    assert rd.stripe_sleutel_geldig("rk_live_abc") == (True, "")


def test_ontbrekende_autorisatie_noemt_per_bron_wat_er_mist():
    weg = rd.ontbrekende_autorisatie({"GOOGLE_OAUTH_CLIENT_ID": "x", "GOOGLE_OAUTH_CLIENT_SECRET": "y", "REVIEW_DESK_STRIPE_KEY": "sb_secret_x"})
    assert weg["gmail"] == ["REVIEW_DESK_GMAIL_REFRESH_TOKEN"]
    assert "geen Stripe-sleutel" in weg["stripe"][0]
    assert set(weg) == {"gmail", "stripe", "sites", "metricool"}
    assert rd.ontbrekende_autorisatie(ALLE) == {}


# ── Limieten ────────────────────────────────────────────────────────────────────────────────────────────
def voorstel(domein, at):
    return {"domain": domein, "thread": domein, "at": at, "bron": "gmail"}


def test_ruimte_twee_per_amsterdamse_dag_over_alle_uitvoerders_en_twintig_totaal():
    s = rd.lege_staat()
    assert rd.acquisitie_ruimte(s, NU)["toegestaan"] == 2
    s["proposals"] = [voorstel("a.nl", rd.iso(NU - timedelta(days=1)))]
    assert rd.acquisitie_ruimte(s, NU)["toegestaan"] == 2
    s["proposals"].append(voorstel("b.nl", rd.iso(NU - timedelta(hours=1))))
    assert rd.acquisitie_ruimte(s, NU)["toegestaan"] == 1
    s["proposals"].append(voorstel("c.nl", rd.iso(NU - timedelta(minutes=5))))
    r = rd.acquisitie_ruimte(s, NU)
    assert r["toegestaan"] == 0 and r["reden"] == "daglimiet bereikt"
    s["proposals"] = [voorstel(f"d{i}.nl", rd.iso(NU - timedelta(days=2 + i))) for i in range(20)]
    r = rd.acquisitie_ruimte(s, NU)
    assert r["toegestaan"] == 0 and r["reden"] == "totaallimiet bereikt"


def test_de_dag_loopt_op_amsterdamse_kalendertijd_niet_op_utc():
    s = rd.lege_staat()
    # 22:30 UTC op 11 okt = 00:30 Amsterdam op 12 okt: dit voorstel hoort bij de 12e.
    s["proposals"] = [voorstel("a.nl", "2026-10-11T22:30:00.000Z"), voorstel("b.nl", "2026-10-11T21:30:00.000Z")]
    assert rd.acquisitie_ruimte(s, NU)["vandaag"] == 1


def test_nooit_buiten_acht_tot_twintig_amsterdam():
    s = rd.lege_staat()
    assert rd.acquisitie_ruimte(s, datetime(2026, 10, 12, 5, 59, tzinfo=timezone.utc))["toegestaan"] == 0     # 07:59 Amsterdam
    assert rd.acquisitie_ruimte(s, datetime(2026, 10, 12, 6, 0, tzinfo=timezone.utc))["toegestaan"] == 2      # 08:00
    assert rd.acquisitie_ruimte(s, datetime(2026, 10, 12, 17, 59, tzinfo=timezone.utc))["toegestaan"] == 2    # 19:59
    assert rd.acquisitie_ruimte(s, datetime(2026, 10, 12, 18, 0, tzinfo=timezone.utc))["toegestaan"] == 0     # 20:00


def test_onbekende_verzenddatum_sluit_de_ruimte_dicht_tot_gmail_hem_leest():
    s = rd.lege_staat()
    s["proposals"] = [{"domain": "x.nl", "thread": "t", "at": None, "bron": "rapport"}]
    r = rd.acquisitie_ruimte(s, NU)
    assert r["toegestaan"] == 0 and "onbekend" in r["reden"]


def test_geen_herinnering_bij_stilte_en_nooit_opnieuw_na_afmelding_of_bounce():
    s = rd.lege_staat()
    s["proposals"] = [voorstel("stil.nl", rd.iso(NU - timedelta(days=9)))]
    s["onderdrukt"] = {"weg.nl": {"reden": "afmelding", "at": "x"}}
    assert rd.mag_benaderen(s, "info@stil.nl")[0] is False
    assert "geen herinnering" in rd.mag_benaderen(s, "info@stil.nl")[1]
    assert rd.mag_benaderen(s, "Contact@Weg.NL")[0] is False
    assert rd.mag_benaderen(s, "nieuw@bureau.nl") == (True, "")


# ── Ontdubbelen en classificeren ────────────────────────────────────────────────────────────────────────
def test_nieuw_en_onthouden_telt_een_id_een_keer_en_is_begrensd():
    s = rd.lege_staat()
    assert rd.nieuw_en_onthouden(s, "gmail", ["a", "b", "a", ""]) == ["a", "b"]
    assert rd.nieuw_en_onthouden(s, "gmail", ["a", "c"]) == ["c"]
    rd.nieuw_en_onthouden(s, "sites", [str(i) for i in range(rd.GEZIEN_MAX + 50)])
    assert len(s["gezien"]["sites"]) == rd.GEZIEN_MAX


def test_classificatie():
    k = lambda **m: rd.classificeer_bericht(m, EIGEN)
    assert k(**{"from": "Luka <support@axeheadquarters.com>", "labels": ["SENT"]}) == "eigen_verzonden"
    assert k(**{"from": "Mail Delivery Subsystem <mailer-daemon@googlemail.com>"}) == "bounce"
    assert k(**{"from": "a@b.nl", "subject": "Out of office: terug op 14 okt"}) == "automatisch"
    assert k(**{"from": "a@b.nl", "subject": "Re: voorstel", "snippet": "Graag afmelden voor deze mails"}) == "afmelding"
    assert k(**{"from": "a@b.nl", "subject": "Re: voorstel", "snippet": "Interessant, kunnen we bellen?"}) == "reactie"


def test_gmail_verwerking_voorstellen_reacties_afmeldingen_en_bounces():
    s = rd.lege_staat()
    s["proposals"] = [{"domain": "webnomad.nl", "thread": "1a11", "at": None, "bron": "rapport"}]
    nu = NU
    msgs = [
        {"id": "1", "thread": "1a11", "labels": ["SENT"], "from": "support@axeheadquarters.com", "to": ["info@webnomad.nl"], "date": "2026-10-09T09:00:00.000Z", "subject": "", "snippet": ""},
        {"id": "2", "thread": "t2", "labels": ["SENT"], "from": "support@axeheadquarters.com", "to": ["info@nieuwbureau.nl"], "date": "2026-10-12T08:00:00.000Z", "subject": "", "snippet": ""},
        {"id": "3", "thread": "t3", "labels": ["INBOX"], "from": "Anna <anna@interesse.nl>", "to": [], "date": "2026-10-12T09:00:00.000Z", "subject": "Re: voorstel", "snippet": "Graag meer info"},
        {"id": "4", "thread": "t4", "labels": ["INBOX"], "from": "x@stop.nl", "to": [], "date": "2026-10-12T09:10:00.000Z", "subject": "Re", "snippet": "Geen interesse, niet meer mailen"},
        {"id": "5", "thread": "t5", "labels": ["INBOX"], "from": "mailer-daemon@googlemail.com", "to": [], "bounce_voor": ["kapot@bounce.nl"], "date": "2026-10-12T09:20:00.000Z", "subject": "Delivery Status Notification (Failure)", "snippet": ""},
        {"id": "6", "thread": "t6", "labels": ["SENT"], "from": "support@axeheadquarters.com", "to": ["support@axeheadquarters.com"], "date": "2026-10-12T09:30:00.000Z", "subject": "", "snippet": ""},
    ]
    uit = rd.verwerk_gmail(s, msgs, EIGEN, set(), nu)
    # De overgenomen datum van webnomad is nu bekend; er komt geen tweede voorstel bij.
    wn = next(v for v in s["proposals"] if v["domain"] == "webnomad.nl")
    assert wn["at"] == "2026-10-09T09:00:00.000Z" and wn["bron"] == "gmail"
    assert [v["domain"] for v in uit["voorstellen"]] == ["nieuwbureau.nl"]
    assert [r["domain"] for r in uit["reacties"]] == ["interesse.nl"]
    assert s["onderdrukt"]["stop.nl"]["reden"] == "afmelding"
    assert s["onderdrukt"]["bounce.nl"]["reden"] == "bounce"
    assert uit["andere_verzonden"] == 1          # aan jezelf: geen voorstel
    # Dezelfde berichten nog eens: niets verandert.
    n = len(s["proposals"])
    uit2 = rd.verwerk_gmail(s, msgs, EIGEN, set(), nu)
    assert uit2["nieuwe_berichten"] == 0 and len(s["proposals"]) == n


def test_een_betaling_telt_een_keer_ook_als_checkout_en_factuur_haar_allebei_noemen():
    s = rd.lege_staat()
    b = [
        {"id": "cs_1", "payment_intent": "pi_1", "betaald": True, "bedrag_cent": 9900},
        {"id": "in_1", "payment_intent": "pi_1", "betaald": True, "bedrag_cent": 9900},       # dezelfde betaling via de factuur
        {"id": "cs_2", "payment_intent": "pi_2", "betaald": False, "bedrag_cent": 9900},      # checkout open: niet betaald
    ]
    uit = rd.verwerk_betalingen(s, b)
    assert uit["nieuwe_betalingen"] == 1 and uit["totaal"] == 1 and uit["bedrag_cent"] == 9900
    assert rd.verwerk_betalingen(s, b)["nieuwe_betalingen"] == 0


def test_posts_ontdubbeld_op_id_en_op_inhoud():
    s = rd.lege_staat()
    uit = rd.verwerk_posts(s, [{"id": "p1", "tekst": "Review desk"}, {"id": "p2", "tekst": "Review desk"}, {"id": "p3", "tekst": "Anders"}], 10)
    assert uit["nieuwe_posts"] == 2 and uit["views"] == 10
    assert rd.mag_publiceren(s, "p9", "review desk") is False            # dezelfde tekst gaat niet nog eens uit
    assert rd.mag_publiceren(s, "p1", "wat dan ook") is False            # hetzelfde id ook niet
    assert rd.mag_publiceren(s, "p9", "echt nieuw") is True


# ── Het rapport ─────────────────────────────────────────────────────────────────────────────────────────
def test_het_huidige_rapportformaat_valideert_en_te_lange_waarden_niet():
    assert rd.valideer_snapshot(rapport()) == []
    kapot = rapport()
    kapot["metrics"][0]["label"] = "x" * 101
    kapot["links"].append({"label": "http", "url": "http://nee"})
    kapot["updatedAt"] = "10 oktober"
    fouten = rd.valideer_snapshot(kapot)
    assert any("metric" in f for f in fouten) and any("link" in f for f in fouten) and "updatedAt" in fouten


def test_alleen_gelezen_bronnen_raken_hun_waarneming_aan_en_een_fout_vult_geen_nul_in():
    s = rd.lege_staat()
    s["proposals"] = [voorstel("a.nl", rd.iso(NU))] * 3
    res = {"gmail": {"status": "ok", "samenvatting": "x"}, "stripe": {"status": "fout", "bericht": "HTTPError: 500"},
           "sites": {"status": "autorisatie", "ontbreekt": ["REVIEW_DESK_SITES_URL"]}, "metricool": {"status": "autorisatie", "ontbreekt": ["METRICOOL_USER_TOKEN"]}}
    snap, veranderd = rd.pas_rapport_toe(rapport(), res, {}, s, NU)
    assert veranderd
    m = {x["label"]: x for x in snap["metrics"]}
    assert m["Proposals sent"]["value"] == 3 and m["Proposals sent"]["asOf"] == rd.iso(NU)
    # Stripe faalde, Sites/Metricool zijn niet aangesloten: oude waarde én oude datum blijven.
    assert m["Recorded payment events"]["value"] == 0 and m["Recorded payment events"]["asOf"] == "2026-10-10T15:29:34.634Z"
    assert m["Website inquiries"]["asOf"] == "2026-10-10T15:29:34.634Z"
    assert m["Published social posts"]["value"] == 1
    kanaal = next(c for c in snap["channels"] if c["name"] == rd.KANAAL_NAAM)
    assert "stripe: fout (HTTPError: 500); oude waarneming behouden" in kanaal["status"]
    assert "sites: NIET aangesloten" in kanaal["status"] and "REVIEW_DESK_SITES_URL" in kanaal["status"]
    assert "Overname: NIET bewezen" in kanaal["status"]
    assert rd.valideer_snapshot(snap) == []
    # Het eigen oude kanaal Gmail en wat een mens schreef blijft onaangeroerd.
    assert next(c for c in snap["channels"] if c["name"] == "Gmail")["status"] == "oud" and snap["actions"][0] == "Mensen-actie"


def test_dezelfde_uitkomst_twee_keer_toepassen_verandert_niets_meer():
    s = rd.lege_staat()
    res = {b: {"status": "autorisatie", "ontbreekt": ["X"]} for b in rd.BRONNEN}
    een, v1 = rd.pas_rapport_toe(rapport(), res, {}, s, NU)
    twee, v2 = rd.pas_rapport_toe(een, res, {}, s, NU + timedelta(minutes=30))
    assert v1 is True and v2 is False and twee == een


def test_een_nieuwe_reactie_wordt_een_lead_en_een_actie_zonder_de_tekst_over_te_nemen():
    s = rd.lege_staat()
    ev = {"gmail": {"reacties": [{"domain": "interesse.nl", "thread": "t3", "at": "2026-10-12T09:00:00.000Z", "id": "3"}], "afmeldingen": [], "bounces": []}}
    snap, _ = rd.pas_rapport_toe(rapport(), {"gmail": {"status": "ok", "samenvatting": "x"}}, ev, s, NU)
    lead = next(l for l in snap["leads"] if l["name"] == "interesse.nl")
    assert lead["status"] == "Reply received" and "thread t3" in lead["note"]
    assert any(a.startswith(rd.WORKER_PREFIX) and "interesse.nl" in a for a in snap["actions"])
    snap2, v = rd.pas_rapport_toe(snap, {"gmail": {"status": "ok", "samenvatting": "x"}}, ev, s, NU)
    assert len([l for l in snap2["leads"] if l["name"] == "interesse.nl"]) == 1


def test_overname_pas_na_twee_geslaagde_geplande_runs_op_verschillende_slots():
    s = rd.lege_staat()
    run = lambda trig, ok, slot: s["runs"].append({"trigger": trig, "alle_bronnen_ok": ok, "slot": slot})
    run("manual", True, "a"); run("manual", True, "b")
    assert rd.overname_status(s)["bewezen"] is False                  # handmatige runs tellen niet
    run("scheduled", True, "2026-10-12T08")
    assert rd.overname_status(s)["bewezen"] is False and rd.overname_status(s)["geslaagde_geplande_runs"] == 1
    run("scheduled", False, "2026-10-12T09")
    assert rd.overname_status(s)["bewezen"] is False                  # een mislukte run ertussen
    run("scheduled", True, "2026-10-12T10")
    assert rd.overname_status(s)["bewezen"] is False                  # de laatste twee: één mislukt
    run("scheduled", True, "2026-10-12T11")
    assert rd.overname_status(s)["bewezen"] is True
    run("scheduled", True, "2026-10-12T11")
    assert rd.overname_status(s)["bewezen"] is False                  # twee keer hetzelfde slot is één run


# ── Een hele run ────────────────────────────────────────────────────────────────────────────────────────
def volle_wereld():
    w = Wereld()
    for i, m in [
        bericht("s1", ["SENT"], "support@axeheadquarters.com", "info@webnomad.nl", thread="1a11514d4f019d32", ms=1760000000000),
        bericht("s2", ["SENT"], "support@axeheadquarters.com", "info@nieuwbureau.nl", thread="t-new", ms=1760300000000),
        bericht("r1", ["INBOX"], "Anna <anna@interesse.nl>", "", "Re: voorstel", "Graag meer info", thread="t-r1", ms=1760310000000),
    ]:
        w.gmail_berichten[i] = m
    w.stripe_sessies = [{"id": "cs_1", "payment_intent": "pi_1", "status": "complete", "payment_status": "paid", "amount_total": 9900, "currency": "eur", "created": 1760200000}]
    w.sites = {"inquiries": [{"id": "q1", "company": "Studio X", "created_at": "2026-10-11T10:00:00Z"}], "payment_events": [{"id": "e1", "payment_intent": "pi_1", "status": "paid", "amount_cents": 9900}]}
    w.posts = [{"uuid": "u1", "text": "Review desk", "draft": False, "providers": [{"network": "tiktok", "status": "PUBLISHED"}]},
               {"uuid": "u2", "text": "Nog niet", "draft": True, "providers": [{"network": "tiktok", "status": "PENDING"}]}]
    w.tiktok = [{"videoId": "v1", "viewCount": 25}]
    return w


def draai(opslag, w, sleutels=ALLE, nu=NU, trigger="scheduled", slot="2026-10-12T12", concept=None):
    return rd.run_bronrun(opslag, w.client(), sleutels, nu, trigger, slot, concept)


def test_een_volledige_run_leest_vier_bronnen_ontdubbelt_en_schrijft_het_rapport_met_cas():
    o, w = Opslag(), volle_wereld()
    uit = draai(o, w)
    assert uit["status"] == "ok", uit
    snap = o.rijen[rd.RAPPORT_SLEUTEL].value
    m = {x["label"]: x["value"] for x in snap["metrics"]}
    # 7 -> 2 uit het rapport (webnomad, wearenew) + nieuwbureau; echte datums uit Gmail.
    assert m["Proposals sent"] == 3
    assert m["Website inquiries"] == 1
    assert m["Recorded payment events"] == 1            # Stripe-sessie én Sites-gebeurtenis voor dezelfde betaling: één keer
    assert m["Published social posts"] == 1             # de draft telt niet
    assert m["TikTok video views"] == 25
    assert m["Received at last check"] == 0             # geld-metric blijft: netto na btw/kosten is niet vastgesteld
    assert any(l["name"] == "interesse.nl" for l in snap["leads"]) and any(l["name"] == "Studio X" for l in snap["leads"])
    assert rd.valideer_snapshot(snap) == []
    assert rd.STAAT_SLEUTEL in o.rijen and o.schrijfacties.count(rd.RAPPORT_SLEUTEL) == 1


def test_een_tweede_run_met_dezelfde_bronnen_telt_niets_dubbel_en_schrijft_het_rapport_niet_opnieuw():
    o, w = Opslag(), volle_wereld()
    draai(o, w)
    voor = copy.deepcopy(o.rijen[rd.RAPPORT_SLEUTEL].value)
    uit = draai(o, w, nu=NU + timedelta(hours=1), slot="2026-10-12T13")
    assert uit["status"] == "ok"
    na = o.rijen[rd.RAPPORT_SLEUTEL].value
    # Metrics, leads en acties zijn gelijk; alleen de eigen kanaalregel mag mee veranderen (de overname is nu bewezen).
    for veld in ("metrics", "leads", "actions", "sections", "links"):
        assert na[veld] == voor[veld], veld
    assert "BEWEZEN" in next(c for c in na["channels"] if c["name"] == rd.KANAAL_NAAM)["status"]
    staat = o.rijen[rd.STAAT_SLEUTEL].value
    assert staat["tellers"]["inquiries"] == 1 and staat["tellers"]["betalingen"] == 1 and len(staat["proposals"]) == 3
    assert rd.overname_status(staat)["bewezen"] is True        # twee geslaagde geplande runs op twee slots


def test_er_wordt_nooit_een_mail_verstuurd_of_iets_gepubliceerd():
    o, w = Opslag(), volle_wereld()
    draai(o, w)
    assert all(meth == "GET" or "oauth2" in url for meth, url in w.verzoeken)
    assert not any("send" in url or "drafts" in url or ("scheduler/posts" in url and meth != "GET") for meth, url in w.verzoeken)


def test_een_cas_botsing_leest_opnieuw_en_behoudt_wat_de_andere_schrijver_toevoegde():
    o, w = Opslag(botsing_eerste=True), volle_wereld()
    uit = draai(o, w)
    assert uit["status"] == "ok"
    snap = o.rijen[rd.RAPPORT_SLEUTEL].value
    assert "Door ChatGPT toegevoegd" in snap["actions"]                      # niet overschreven
    assert {x["label"]: x["value"] for x in snap["metrics"]}["Proposals sent"] == 3


def test_zonder_autorisatie_is_de_run_overgeslagen_niet_mislukt_en_noemt_wat_er_nodig_is():
    o, w = Opslag(), Wereld()
    uit = draai(o, w, sleutels={"METRICOOL_BLOG_ID": "7244586"})
    assert uit["status"] == "skipped"
    assert w.verzoeken == []                                                  # zonder sleutels raakt hij geen enkele bron aan
    assert all(r["status"] == "autorisatie" for r in uit["resultaten"].values())
    kanaal = next(c for c in o.rijen[rd.RAPPORT_SLEUTEL].value["channels"] if c["name"] == rd.KANAAL_NAAM)
    assert "REVIEW_DESK_GMAIL_REFRESH_TOKEN" in kanaal["status"] and "METRICOOL_USER_TOKEN" in kanaal["status"]
    assert rd.overname_status(o.rijen[rd.STAAT_SLEUTEL].value)["geslaagde_geplande_runs"] == 0


def test_stripe_dat_de_sleutel_weigert_wordt_autorisatie_en_laat_de_oude_waarde_staan():
    o, w = Opslag(), volle_wereld()
    w.stripe_status = 401
    uit = draai(o, w)
    assert uit["status"] == "skipped" and uit["resultaten"]["stripe"]["status"] == "autorisatie"
    snap = o.rijen[rd.RAPPORT_SLEUTEL].value
    pe = next(x for x in snap["metrics"] if x["label"] == "Recorded payment events")
    assert pe["value"] == 0 and pe["asOf"] == "2026-10-10T15:29:34.634Z"
    assert next(x for x in snap["metrics"] if x["label"] == "Proposals sent")["value"] == 3   # de andere bronnen gingen wel door


def test_te_veel_gmail_berichten_is_gedeeltelijk_en_schuift_de_cursor_niet_op():
    o, w = Opslag(), Wereld()
    w.gmail_lijst_extra = True
    uit = draai(o, w)
    assert uit["resultaten"]["gmail"]["status"] == "fout" and "gedeeltelijk" in uit["resultaten"]["gmail"]["bericht"]
    assert uit["status"] == "fail"
    assert "gmail" not in o.rijen[rd.STAAT_SLEUTEL].value["cursors"]
    # Begrensd: nooit meer dan MAX_PAGINAS lijstverzoeken per zoekopdracht.
    lijst = [u for m, u in w.verzoeken if u.endswith("/messages") or "/messages?" in u]
    assert len(lijst) <= 3 * rd.MAX_PAGINAS


def test_geen_ai_voor_lege_controles_alleen_een_nieuwe_reactie_vraagt_een_concept():
    o, w = Opslag(), volle_wereld()
    aanroepen = []
    draai(o, w, concept=lambda r: aanroepen.append(r))
    assert [a["domain"] for a in aanroepen] == ["interesse.nl"]
    aanroepen.clear()
    draai(o, w, nu=NU + timedelta(hours=1), slot="2026-10-12T13", concept=lambda r: aanroepen.append(r))
    assert aanroepen == []                                                    # niets nieuws: geen enkele aanroep


def test_een_conceptfout_laat_de_bronrun_niet_falen():
    o, w = Opslag(), volle_wereld()
    def stuk(_):
        raise RuntimeError("model weg")
    assert draai(o, w, concept=stuk)["status"] == "ok"


def test_een_ongeldig_bijgewerkt_rapport_wordt_niet_geschreven():
    o, w = Opslag(), volle_wereld()
    o.rijen[rd.RAPPORT_SLEUTEL].value["links"].append({"label": "x", "url": "http://onveilig"})   # al ongeldig
    uit = draai(o, w)
    assert uit["status"] == "fail" and "ongeldig" in uit["output"]
    assert rd.RAPPORT_SLEUTEL not in o.schrijfacties


# ── Concepten: alleen een Gmail-concept, nooit verzenden ────────────────────────────────────────────────
def test_een_concept_wordt_een_gmail_concept_in_de_juiste_thread_en_er_wordt_nooit_verzonden():
    import base64 as b64
    w = Wereld()
    verzoeken = []

    def handler(req):
        verzoeken.append((req.method, req.url.path, req.content))
        if req.url.host == "oauth2.googleapis.com":
            return httpx.Response(200, json={"access_token": "at"})
        if req.method == "GET":
            tekst = b64.urlsafe_b64encode("Hoi, wat kost een review?".encode()).decode()
            return httpx.Response(200, json={"threadId": "t-r1", "payload": {"mimeType": "multipart/alternative", "headers": [
                {"name": "From", "value": "Anna <anna@interesse.nl>"}, {"name": "Subject", "value": "Vraag"}, {"name": "Message-ID", "value": "<abc@x>"}],
                "parts": [{"mimeType": "text/plain", "body": {"data": tekst}}]}})
        return httpx.Response(200, json={"id": "draft-1"})

    http = httpx.Client(transport=httpx.MockTransport(handler))
    vragen = []
    maak = rd.concept_fabriek(http, ALLE, lambda msgs: vragen.append(msgs) or "Dank voor je bericht. De pilot kost €99 excl. btw.")
    assert maak({"id": "r1", "domain": "interesse.nl"}) == "draft-1"
    post = next(v for v in verzoeken if v[0] == "POST" and "gmail" in v[1] or v[1].endswith("/drafts"))
    assert post[1].endswith("/users/me/drafts")
    body = json.loads(post[2])
    assert body["message"]["threadId"] == "t-r1"
    raw = b64.urlsafe_b64decode(body["message"]["raw"]).decode()
    assert "To: Anna <anna@interesse.nl>" in raw and "Subject: Re: Vraag" in raw and "In-Reply-To: <abc@x>" in raw and "De pilot kost" in raw
    assert not any("send" in v[1] for v in verzoeken)
    assert "Hoi, wat kost een review?" in vragen[0][1]["content"]


def test_een_leeg_bericht_of_leeg_modelantwoord_maakt_geen_concept():
    import base64 as b64

    def handler(req):
        if req.url.host == "oauth2.googleapis.com":
            return httpx.Response(200, json={"access_token": "at"})
        return httpx.Response(200, json={"threadId": "t", "payload": {"mimeType": "text/plain", "headers": [], "body": {"data": b64.urlsafe_b64encode(b"   ").decode()}}})
    http = httpx.Client(transport=httpx.MockTransport(handler))
    gevraagd = []
    assert rd.concept_fabriek(http, ALLE, lambda m: gevraagd.append(1) or "x")({"id": "r"}) is None
    assert gevraagd == []        # een leeg bericht kost geen modelaanroep


def test_llm_ketting_kan_beperkt_worden_tot_gratis_aanbieders(monkeypatch):
    import asyncio
    import llm_cascade as lc
    lc.vergeet_alles()
    monkeypatch.setenv("OPENAI_API_KEY", "x")
    monkeypatch.setenv("GROQ_API_KEY", "y")
    gebeld = []

    class Res:
        status_code, text = 200, ""
        def json(self): return {"choices": [{"message": {"content": "antwoord"}}]}

    class Client:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def post(self, url, **k):
            gebeld.append(url)
            return Res()
    monkeypatch.setattr(lc.httpx, "AsyncClient", Client)
    asyncio.run(lc.chat([{"role": "user", "content": "hoi"}], alleen=("groq", "ollama")))
    assert gebeld == ["https://api.groq.com/openai/v1/chat/completions"]      # OpenAI wordt overgeslagen


# ── Het toestemmingsscript schrijft één regel en laat de kluis verder ongemoeid ─────────────────────────
def _auth_module(kluis):
    import importlib.util
    import pathlib
    pad = pathlib.Path(__file__).resolve().parents[2] / "scripts" / "review-desk-gmail-auth.py"
    spec = importlib.util.spec_from_file_location("rd_auth", pad)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    m.KLUIS = str(kluis)
    return m


def test_het_toestemmingsscript_voegt_het_token_toe_zonder_de_rest_van_de_kluis_te_raken(tmp_path):
    import os
    kluis = tmp_path / "secrets.env"
    inhoud = "#public\nSUPABASE_URL=https://x\nGOOGLE_OAUTH_CLIENT_ID=abc\n\nOPENAI_API_KEY=sk-geheim\n"
    kluis.write_text(inhoud)
    os.chmod(kluis, 0o600)
    m = _auth_module(kluis)
    m.schrijf_kluis("REVIEW_DESK_GMAIL_REFRESH_TOKEN", "rt-nieuw")
    na = kluis.read_text()
    assert na.startswith(inhoud.rstrip("\n")) and "REVIEW_DESK_GMAIL_REFRESH_TOKEN=rt-nieuw" in na
    assert (os.stat(kluis).st_mode & 0o777) == 0o600
    assert (tmp_path / "secrets.env.bak-review-desk").read_text() == inhoud          # backup van het origineel
    m.schrijf_kluis("REVIEW_DESK_GMAIL_REFRESH_TOKEN", "rt-ververst")                 # tweede keer vervangt, voegt niet toe
    assert na.count("REVIEW_DESK_GMAIL_REFRESH_TOKEN") == 1
    assert kluis.read_text().count("REVIEW_DESK_GMAIL_REFRESH_TOKEN") == 1 and "rt-ververst" in kluis.read_text()
    assert m.lees_kluis()["OPENAI_API_KEY"] == "sk-geheim"                             # onaangeroerd
