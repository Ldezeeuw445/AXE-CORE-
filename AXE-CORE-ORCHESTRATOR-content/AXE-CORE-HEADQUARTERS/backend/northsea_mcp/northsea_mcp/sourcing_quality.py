"""Kwaliteitshek voor net-new discovery-kandidaten.

De lokale sourcing-crew (GoldenRuntime) is deterministisch en klaar in ~0 s: hij
scoorde elke zoekhit mét titel+URL als leverancier (fit ~50). Overnight Tavily-
queries op 'Copper Cathode exporter producer supplier' leverden daarom Yahoo
Finance, TradeImeX, Investing News Network en ticker-pagina's op als 'suppliers',
zonder e-mail of bedrijfsidentiteit.

Dit hek is expres streng en delenloos: nieuws, koerspagina's, blogs, statistiek-
portalen en directories vallen af. Alleen een treffer die op een echt bedrijf
lijkt én een bruikbaar contactpad heeft (e-mail bij voorkeur, anders de eigen
bedrijfssite) mag naar een Chase-review. Geen outreach, geen opportunity.
"""
from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

# Hosts (zonder www.) waarvan we weten dat ze content/koers/directory zijn, geen
# koperproducent. Suffix-match: finance.yahoo.com valt onder yahoo.com.
JUNK_HOST_SUFFIXES = (
    "yahoo.com", "yahoo.co.jp",
    "investing.com", "investingnews.com", "inn.investingnews.com",
    "tradeimex.in", "tradeimex.com",
    "marketwatch.com", "seekingalpha.com", "simplywall.st",
    "stockanalysis.com", "marketbeat.com", "tradingview.com",
    "bloomberg.com", "reuters.com", "cnbc.com", "ft.com", "wsj.com",
    "fool.com", "barrons.com", "benzinga.com",
    "tradingeconomics.com", "statista.com", "indexmundi.com",
    "metalbulletin.com", "kitco.com", "kitconet.com",
    "wikipedia.org", "reddit.com", "youtube.com", "youtu.be",
    "facebook.com", "twitter.com", "x.com", "medium.com", "substack.com",
    "blogspot.com", "wordpress.com", "tumblr.com",
    "alibaba.com", "aliexpress.com", "tradekey.com", "go4worldbusiness.com",
    "indiamart.com", "exportgenius.com", "volza.com", "importgenius.com",
    "zauba.com", "panjiva.com", "exportgenius.in",
    "crunchbase.com",
    "google.com", "bing.com",
    "mining.com",  # nieuws, geen producent
    "coppermark.org",  # keurmerk/directorie, geen verkopende partij
    "newsweek.com", "forbes.com", "businessinsider.com",
    "prnewswire.com", "globenewswire.com", "businesswire.com",
)

JUNK_PATH_MARKERS = (
    "/quote/", "/quotes/", "/symbol/", "/stock/", "/stocks/",
    "/ticker/", "/chart/", "/charts/", "/markets/stocks/",
    "/news/", "/blog/", "/blogs/", "/article/", "/articles/",
    "/press-release/", "/opinion/", "/statistics/", "/stats/",
)

JUNK_TITLE_RE = re.compile(
    r"\b(share price|stock price|stocks? to watch|stock quote|otc(?:mkts)?|"
    r"market news|import[- ]export data|trade statistics|trade data|"
    r"top \d+|exporters in \d{4}|price today|52[- ]week)\b",
    re.I,
)
HEADLINE_RE = re.compile(
    r"\b(announces|reports|rises|falls|outlook|statistics|database|"
    r"trade leads?|market report|weekly roundup|breaking)\b",
    re.I,
)
COMPANY_SUFFIX_RE = re.compile(
    r"\b(ltd|limited|plc|ag|inc|corp|corporation|gmbh|bv|sa|sas|pty|"
    r"llc|nv|spa|kk|co|company|mines|mining|smelter|refiner(?:y|ies)?|"
    r"metallurg(?:y|ical)?|resources|metals)\b",
    re.I,
)
BROKER_RE = re.compile(
    r"\b(broker|marketplace|b2b|directory|trade leads?|alibaba|tradekey|"
    r"go4worldbusiness|indiamart)\b",
    re.I,
)
EMAIL_RE = re.compile(
    r"\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b",
)
PHONE_RE = re.compile(
    r"(?:\+|00)?\d[\d \-().]{7,}\d",
)
CONTACT_PATH_RE = re.compile(
    r"/(contact|contacts|sales|enquire|inquiry|enquiry|reach-us)(?:/|$|\?)",
    re.I,
)
GENERIC_EMAIL_LOCAL = frozenset({
    "noreply", "no-reply", "donotreply", "privacy", "legal", "webmaster",
    "editor", "editors", "newsroom", "press", "support", "help",
})

# Tavily exclude_domains: korte, stabiele lijst van de hosts die live junk gaven.
TAVILY_EXCLUDE_DOMAINS = (
    "finance.yahoo.com", "yahoo.com", "investing.com", "investingnews.com",
    "tradeimex.in", "marketwatch.com", "seekingalpha.com", "tradingview.com",
    "tradingeconomics.com", "wikipedia.org", "alibaba.com", "tradekey.com",
    "mining.com", "kitco.com",
)


def domain_of(url: str | None) -> str | None:
    if not url:
        return None
    ruw = url.strip()
    if not ruw:
        return None
    if "://" not in ruw:
        ruw = "https://" + ruw
    try:
        host = (urlparse(ruw).hostname or "").lower()
    except ValueError:
        return None
    if host.startswith("www."):
        host = host[4:]
    return host or None


def _path_of(url: str | None) -> str:
    if not url:
        return ""
    ruw = url.strip()
    if "://" not in ruw:
        ruw = "https://" + ruw
    try:
        return (urlparse(ruw).path or "").lower()
    except ValueError:
        return ""


def is_junk_host(host: str | None) -> bool:
    if not host:
        return False
    h = host.lower()
    return any(h == s or h.endswith("." + s) for s in JUNK_HOST_SUFFIXES)


def junk_reason(url: str | None, title: str | None = None, content: str | None = None) -> str | None:
    """Waarom deze treffer geen bedrijfskandidaat is, of None als hij mag blijven."""
    host = domain_of(url)
    path = _path_of(url)
    titel = title or ""
    tekst = f"{titel} {content or ''}"
    if host and (host.endswith(".gov") or ".gov." in host):
        return "government information page, not a commercial counterparty"
    if is_junk_host(host):
        return f"content/finance/news host: {host}"
    if any(m in path for m in JUNK_PATH_MARKERS):
        return f"news/quote/blog path: {path[:80]}"
    if JUNK_TITLE_RE.search(titel) or JUNK_TITLE_RE.search(tekst):
        return "title/snippet is a quote, stats or news page"
    if BROKER_RE.search(titel) or BROKER_RE.search(host or ""):
        return "broker/marketplace/directory listing"
    return None


def looks_like_company_name(name: str | None) -> bool:
    n = (name or "").strip()
    if not n or n.upper() == "UNKNOWN":
        return False
    if HEADLINE_RE.search(n):
        return False
    if JUNK_TITLE_RE.search(n):
        return False
    if COMPANY_SUFFIX_RE.search(n):
        return True
    # Korte merknaam (niet een zin): 1–6 woorden, geen pipe/krantenkop.
    woorden = n.split()
    if "|" in n or " - " in n and len(woorden) > 6:
        return False
    if 1 <= len(woorden) <= 6 and not n.endswith("?"):
        return True
    return False


def extract_emails(text: str | None) -> list[str]:
    if not text:
        return []
    gezien: list[str] = []
    for ruw in EMAIL_RE.findall(text):
        adres = ruw.strip(".,;:()<>[]").lower()
        local, _, host = adres.partition("@")
        if local in GENERIC_EMAIL_LOCAL:
            continue
        if is_junk_host(host):
            continue
        if adres not in gezien:
            gezien.append(adres)
    return gezien


def extract_phones(text: str | None) -> list[str]:
    if not text:
        return []
    out: list[str] = []
    for m in PHONE_RE.findall(text):
        digits = re.sub(r"\D", "", m)
        if 8 <= len(digits) <= 15 and m.strip() not in out:
            out.append(m.strip())
    return out[:3]


def has_contact_path(*, email: str | None, phone: str | None, url: str | None,
                     content: str | None = None) -> bool:
    """Bruikbaar contactpad: e-mail (voorkeur), telefoon, /contact, of eigen bedrijfssite."""
    if email and "@" in email:
        return True
    if phone:
        return True
    if url and CONTACT_PATH_RE.search(_path_of(url)):
        return True
    if content:
        if extract_emails(content) or extract_phones(content):
            return True
        if "mailto:" in content.lower() or CONTACT_PATH_RE.search(content):
            return True
    # Eigen niet-junk site (geen artikelpad) telt als pad waar een mens contact
    # kan zoeken. Yahoo-/blog-URL's zijn hier al afgevallen via junk_reason.
    if url and domain_of(url) and not any(m in _path_of(url) for m in JUNK_PATH_MARKERS):
        return True
    return False


def supplier_search_query(commodity: str, geography: str = "") -> str:
    """Zoekvraag die bedrijfssites prefereert boven nieuws/koerspagina's."""
    delen = [commodity.strip(), geography.strip()]
    basis = " ".join(d for d in delen if d) or "commodity"
    return f'{basis} producer OR refinery OR smelter OR "mining company" official website contact'


def hit_as_dict(hit: dict[str, Any]) -> dict[str, Any]:
    naam = (hit.get("name") or hit.get("title") or "").strip()
    url = hit.get("url")
    content = hit.get("content") or hit.get("snippet") or hit.get("text") or ""
    emails = extract_emails(" ".join(str(x) for x in (naam, url, content, hit.get("email") or "") if x))
    email = hit.get("email") if hit.get("email") and "@" in str(hit.get("email")) else (emails[0] if emails else None)
    phones = extract_phones(content)
    return {
        "name": naam or "UNKNOWN",
        "url": url,
        "content": content[:1500] if isinstance(content, str) else "",
        "email": email,
        "phone": phones[0] if phones else hit.get("phone"),
        "source": hit.get("source"),
    }


def qualify_candidate(hit: dict[str, Any]) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """Houdt een kandidaat of geeft hem terug als rejected mét reden.

    Returnt (kept, None) of (None, rejected).
    """
    ruw = hit_as_dict(hit)
    naam, url, content = ruw["name"], ruw["url"], ruw["content"]
    reden = junk_reason(url, naam, content)
    if reden:
        return None, {**hit, **ruw, "fit_score": 0, "reject_reason": reden}
    if not looks_like_company_name(naam):
        return None, {**hit, **ruw, "fit_score": 0, "reject_reason": "no verifiable company identity"}
    if not has_contact_path(email=ruw.get("email"), phone=ruw.get("phone"), url=url, content=content):
        return None, {**hit, **ruw, "fit_score": 0, "reject_reason": "no usable contact path"}
    kept = dict(hit)
    kept.update(ruw)
    if ruw.get("email") and not kept.get("email"):
        kept["email"] = ruw["email"]
    return kept, None


def split_quality(hits: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    gehouden: list[dict[str, Any]] = []
    afgewezen: list[dict[str, Any]] = []
    for h in hits:
        if not isinstance(h, dict):
            continue
        kept, rejected = qualify_candidate(h)
        if kept is not None:
            gehouden.append(kept)
        elif rejected is not None:
            afgewezen.append(rejected)
    return gehouden, afgewezen
