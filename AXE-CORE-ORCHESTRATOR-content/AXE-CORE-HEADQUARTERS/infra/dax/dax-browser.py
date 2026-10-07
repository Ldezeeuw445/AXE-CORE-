#!/usr/bin/env python3
"""dax-browser — de persistente browser van een DAX-computer.

Eén Chromium-profiel per DAX, in het volume /dax/browser-profile. Cookies,
localStorage, IndexedDB en logins blijven bestaan na een herstart van de
container, zolang de website dat zelf toestaat. Headless; later overnemen
(VNC/CDP) kan zonder dit te veranderen: het profiel is gewoon een map.

    dax-browser open URL [--text] [--screenshot PAD] [--wait MS]
    dax-browser eval URL 'JS-expressie'
    dax-browser cookies [URL]

Eén proces tegelijk per profiel (Chromium vergrendelt het). Een tweede aanroep
wacht tot het slot vrij is in plaats van een kapot profiel te maken.
"""
from __future__ import annotations

import argparse
import fcntl
import json
import os
import sys

PROFIEL = os.environ.get("DAX_BROWSER_PROFILE", "/dax/browser-profile")
DOWNLOADS = os.environ.get("DAX_DOWNLOADS", "/dax/artifacts/downloads")


def context(pw):
    os.makedirs(PROFIEL, exist_ok=True)
    os.makedirs(DOWNLOADS, exist_ok=True)
    return pw.chromium.launch_persistent_context(
        PROFIEL, headless=True, accept_downloads=True, downloads_path=DOWNLOADS,
        args=["--no-sandbox", "--disable-dev-shm-usage"],
    )


def main(argv: list[str]) -> int:
    p = argparse.ArgumentParser(prog="dax-browser")
    sub = p.add_subparsers(dest="cmd", required=True)
    o = sub.add_parser("open")
    o.add_argument("url")
    o.add_argument("--text", action="store_true")
    o.add_argument("--screenshot")
    o.add_argument("--wait", type=int, default=0)
    e = sub.add_parser("eval")
    e.add_argument("url")
    e.add_argument("expr")
    c = sub.add_parser("cookies")
    c.add_argument("url", nargs="?")
    a = p.parse_args(argv)

    from playwright.sync_api import sync_playwright

    os.makedirs(PROFIEL, exist_ok=True)
    with open(os.path.join(PROFIEL, ".dax-lock"), "w") as slot:
        fcntl.flock(slot, fcntl.LOCK_EX)
        with sync_playwright() as pw:
            ctx = context(pw)
            try:
                if a.cmd == "cookies":
                    print(json.dumps(ctx.cookies([a.url] if a.url else []), indent=1))
                    return 0
                page = ctx.pages[0] if ctx.pages else ctx.new_page()
                page.goto(a.url, wait_until="domcontentloaded", timeout=60000)
                if getattr(a, "wait", 0):
                    page.wait_for_timeout(a.wait)
                if a.cmd == "eval":
                    print(json.dumps(page.evaluate(a.expr)))
                    return 0
                uit = {"url": page.url, "title": page.title()}
                if a.text:
                    uit["text"] = page.inner_text("body")[:20000]
                if a.screenshot:
                    page.screenshot(path=a.screenshot, full_page=True)
                    uit["screenshot"] = a.screenshot
                print(json.dumps(uit))
                return 0
            finally:
                ctx.close()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
