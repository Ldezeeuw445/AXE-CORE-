#!/usr/bin/env python3
"""
Eenmalige Gmail-toestemming voor de Website Review Desk-bronworker.

Waarom dit script bestaat: de OAuth-client staat al in de kluis (GOOGLE_OAUTH_CLIENT_ID/_SECRET), maar er is nooit
een toestemming gegeven, dus er is geen refresh-token en de worker kan Gmail niet lezen. Toestemming geven kan
alleen Luka zelf, in zijn browser. Dit script doet al het andere.

Wat het doet:
  1. Start een luisteraar op http://localhost:3001/api/source-connections/oauth/callback/gmail (de redirect-URI
     die al bij de client geregistreerd staat).
  2. Opent de Google-toestemmingspagina voor support@axeheadquarters.com met de scopes gmail.readonly en
     gmail.compose (concepten maken; er is geen scope om te verzenden gevraagd).
  3. Wisselt de code in voor een refresh-token (PKCE), controleert dat het token echt bij
     support@axeheadquarters.com hoort, en schrijft het als REVIEW_DESK_GMAIL_REFRESH_TOKEN in de kluis
     (backup + chmod 600). Het token wordt nergens geprint.

Gebruik:  python3 scripts/review-desk-gmail-auth.py            (zonder argumenten)
          python3 scripts/review-desk-gmail-auth.py --alleen-lezen   (alleen gmail.readonly: geen concepten)
"""
from __future__ import annotations

import base64
import hashlib
import http.server
import json
import os
import re
import secrets
import shutil
import sys
import threading
import time
import urllib.parse
import urllib.request
import webbrowser

KLUIS = os.environ.get("AXE_VAULT_ENV", "/Volumes/EagetSSD/AXE-VAULT/secrets.env")
VERWACHT_ADRES = "support@axeheadquarters.com"
POORT = 3001
PAD = "/api/source-connections/oauth/callback/gmail"
NAAM = "REVIEW_DESK_GMAIL_REFRESH_TOKEN"


def lees_kluis() -> dict[str, str]:
    uit: dict[str, str] = {}
    with open(KLUIS, encoding="utf-8") as f:
        for regel in f:
            m = re.match(r"^([A-Z0-9_]+)=(.*)$", regel.rstrip("\n"))
            if m:
                uit[m.group(1)] = m.group(2).strip().strip('"').strip("'")
    return uit


def schrijf_kluis(naam: str, waarde: str) -> None:
    """Vervang of voeg één regel toe; de rest van het bestand blijft byte voor byte gelijk."""
    shutil.copy2(KLUIS, KLUIS + ".bak-review-desk")
    with open(KLUIS, encoding="utf-8") as f:
        regels = f.read().split("\n")
    nieuw, gezet = [], False
    for r in regels:
        if r.startswith(naam + "="):
            nieuw.append(f"{naam}={waarde}")
            gezet = True
        else:
            nieuw.append(r)
    if not gezet:
        while nieuw and nieuw[-1] == "":
            nieuw.pop()
        nieuw += [f"{naam}={waarde}", ""]
    tmp = KLUIS + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write("\n".join(nieuw))
    os.chmod(tmp, 0o600)
    os.replace(tmp, KLUIS)


def post_form(url: str, data: dict[str, str]) -> dict:
    req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode(), method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def main() -> int:
    alleen_lezen = "--alleen-lezen" in sys.argv
    k = lees_kluis()
    cid, geheim = k.get("GOOGLE_OAUTH_CLIENT_ID"), k.get("GOOGLE_OAUTH_CLIENT_SECRET")
    if not cid or not geheim:
        print("GOOGLE_OAUTH_CLIENT_ID/_SECRET ontbreken in de kluis; er is niets om toestemming mee te vragen.")
        return 2
    redirect = f"http://localhost:{POORT}{PAD}"
    if k.get("GOOGLE_OAUTH_REDIRECT_URI") and k["GOOGLE_OAUTH_REDIRECT_URI"] != redirect:
        print(f"Let op: de kluis noemt {k['GOOGLE_OAUTH_REDIRECT_URI']}, dit script gebruikt {redirect}.")
    scopes = ["https://www.googleapis.com/auth/gmail.readonly"] + ([] if alleen_lezen else ["https://www.googleapis.com/auth/gmail.compose"])
    verifier = secrets.token_urlsafe(64)
    uitdaging = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    staat = secrets.token_urlsafe(24)
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + urllib.parse.urlencode({
        "client_id": cid, "redirect_uri": redirect, "response_type": "code", "scope": " ".join(scopes),
        "access_type": "offline", "prompt": "consent", "login_hint": VERWACHT_ADRES, "state": staat,
        "code_challenge": uitdaging, "code_challenge_method": "S256",
    })
    ontvangen: dict[str, str] = {}
    klaar = threading.Event()

    class H(http.server.BaseHTTPRequestHandler):
        def do_GET(self):  # noqa: N802
            p = urllib.parse.urlparse(self.path)
            if p.path != PAD:
                self.send_response(404); self.end_headers(); return
            q = {a: b[0] for a, b in urllib.parse.parse_qs(p.query).items()}
            ontvangen.update(q)
            self.send_response(200); self.send_header("Content-Type", "text/plain; charset=utf-8"); self.end_headers()
            self.wfile.write("Klaar. Je kunt dit tabblad sluiten en terug naar de terminal gaan.".encode())
            klaar.set()

        def log_message(self, *a):  # geen logregels met codes
            pass

    srv = http.server.HTTPServer(("127.0.0.1", POORT), H)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    print(f"Toestemmingspagina openen voor {VERWACHT_ADRES} (scopes: {', '.join(s.rsplit('/', 1)[1] for s in scopes)}).")
    print("Opent hij niet vanzelf, open dan deze link:\n" + url + "\n")
    webbrowser.open(url)
    if not klaar.wait(300):
        print("Geen antwoord binnen 5 minuten; afgebroken.")
        return 3
    srv.shutdown()
    if ontvangen.get("state") != staat or "code" not in ontvangen:
        print("Toestemming geweigerd of ongeldig antwoord:", ontvangen.get("error", "state klopt niet"))
        return 4
    tok = post_form("https://oauth2.googleapis.com/token", {
        "client_id": cid, "client_secret": geheim, "code": ontvangen["code"], "code_verifier": verifier,
        "grant_type": "authorization_code", "redirect_uri": redirect})
    if not tok.get("refresh_token"):
        print("Google gaf geen refresh-token (toestemming eerder gegeven?). Trek de toegang in op myaccount.google.com/permissions en draai dit opnieuw.")
        return 5
    req = urllib.request.Request("https://gmail.googleapis.com/gmail/v1/users/me/profile", headers={"Authorization": "Bearer " + tok["access_token"]})
    with urllib.request.urlopen(req, timeout=30) as r:
        adres = json.load(r).get("emailAddress", "")
    if adres.lower() != VERWACHT_ADRES:
        print(f"Dit token hoort bij {adres}, niet bij {VERWACHT_ADRES}. Er is niets opgeslagen.")
        return 6
    schrijf_kluis(NAAM, tok["refresh_token"])
    print(f"Gelukt: {NAAM} staat in de kluis (backup: {KLUIS}.bak-review-desk). Het token is niet getoond.")
    print("Controleer met:  curl -s -X POST -H \"Authorization: Bearer $(cat ~/.axe/axe-api.key)\" localhost:8001/review-desk/run")
    return 0


if __name__ == "__main__":
    sys.exit(main())
