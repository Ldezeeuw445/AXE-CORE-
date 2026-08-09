"""The scoring vocabulary, kept in one file so it can be tuned without
touching the maths in fusion.py.

Weights are deliberately small integers. This is a ranking system, not a
model — it only has to order candidates better than the operator's gut at
2am, and it has to be explainable when it is wrong.
"""

from __future__ import annotations

# Words that mean "this is actively costing me something".
PAIN_MARKERS: dict[str, int] = {
    "wasted": 3, "waste": 2, "wasting": 3, "hours": 2, "manually": 3, "manual": 2,
    "keeps breaking": 4, "broken": 3, "broke": 2, "fails": 3, "failing": 3,
    "stuck": 3, "blocked": 3, "nightmare": 4, "painful": 3, "pain": 2,
    "frustrating": 3, "frustrated": 3, "impossible": 3, "can't figure": 4,
    "cannot figure": 4, "no idea how": 3, "tried everything": 4,
    "deadline": 3, "urgent": 4, "asap": 4, "losing": 3, "lost": 2,
    "error": 2, "errors": 2, "crash": 3, "crashes": 3, "hate": 2,
    "every single time": 3, "over and over": 3, "again and again": 3,
    "spreadsheet hell": 4, "copy paste": 3, "copy-paste": 3, "by hand": 3,
}

# Words that mean "money is already moving here".
MONEY_MARKERS: dict[str, int] = {
    "pay": 4, "paid": 3, "paying": 4, "budget": 5, "hire": 5, "hiring": 5,
    "freelancer": 4, "contractor": 4, "quote": 4, "invoice": 3, "client": 3,
    "clients": 3, "revenue": 3, "customers": 2, "worth it": 3, "happy to pay": 6,
    "will pay": 6, "willing to pay": 6, "shut up and take": 5, "take my money": 5,
    "subscription": 3, "per month": 3, "/mo": 3, "retainer": 4, "consultant": 4,
    "$": 2, "usd": 2, "eur": 2, "cost us": 3, "costing us": 4, "roi": 3,
    "expensive": 2, "cheaper": 2, "vendor": 3, "procurement": 3, "agency": 3,
}

# Words that mean "one person with a laptop can ship this in under 48 hours".
SOLVABLE_MARKERS: dict[str, int] = {
    "template": 4, "checklist": 4, "script": 3, "spreadsheet": 3, "audit": 4,
    "prompt": 3, "workflow": 3, "automation": 3, "setup": 3, "config": 3,
    "guide": 3, "walkthrough": 3, "example": 2, "boilerplate": 4, "starter": 3,
    "notion": 3, "airtable": 3, "zapier": 3, "n8n": 3, "csv": 3, "api": 2,
    "one-off": 3, "quick": 2, "small": 2, "simple": 2, "review my": 4,
    "look at my": 3, "check my": 3, "fix my": 4, "set up": 3,
}

# Words that mean "this is not a weekend project" — they subtract.
HEAVY_MARKERS: dict[str, int] = {
    "enterprise": 4, "soc2": 5, "soc 2": 5, "hipaa": 5, "compliance": 4,
    "regulated": 4, "on-prem": 4, "legacy migration": 5, "multi-year": 5,
    "team of": 3, "headcount": 4, "rfp": 4, "procurement cycle": 5,
    "custom hardware": 5, "fda": 5, "patent": 4, "law firm": 3,
    "24/7 support": 4, "sla": 3, "uptime guarantee": 4,
}

# Words that mean somebody is *asking*, which is the buying posture we want,
# versus somebody announcing/selling, which is noise.
ASK_MARKERS: dict[str, int] = {
    "how do i": 3, "how do you": 3, "how to": 2, "anyone know": 3,
    "recommendations": 3, "recommend": 2, "looking for": 4, "need a": 4,
    "need help": 4, "is there a": 3, "does anyone": 3, "advice": 2,
    "suggestions": 2, "help with": 3, "wanted": 3, "wtb": 5,
}

# Announcements / self-promo: strong negative, they are not demand.
NOISE_MARKERS: dict[str, int] = {
    "i built": 4, "i made": 4, "show hn": 4, "launching": 3, "launched": 3,
    "we're excited": 5, "we are excited": 5, "introducing": 4, "check out my": 4,
    "please upvote": 5, "giveaway": 4, "free course": 3, "affiliate": 3,
    "my new": 3, "just shipped": 3, "beta testers": 3,
}

STOPWORDS: frozenset[str] = frozenset("""
a about after all also am an and any are as at be because been before being
but by can cant could did do does doing dont down each even every for from
get got had has have having he her here hers him his how i if in into is it
its just like me might more most much must my no nor not now of off on once
one only or other our out over own re said same she should since so some
still such than that the their them then there these they this those through
to too under until up us use used using very was way we well were what when
where which while who why will with would you your yours im ive youre thats
does doesnt isnt arent wasnt werent about around another anyone something
anything really actually thing things lot lots want wants need needs
""".split())

# Source credibility for willingness-to-pay. A job board post is a person with
# a wallet open; a random forum question is a person with a question.
SOURCE_WEIGHT: dict[str, float] = {
    "freelance_board": 1.0,
    "job_board": 0.95,
    "marketplace_request": 0.9,
    "stackexchange": 0.6,
    "reddit": 0.55,
    "hackernews": 0.55,
    "forum": 0.5,
    "discord": 0.45,
    "seed": 0.5,
    "unknown": 0.4,
}

AUTHOR_KIND_WEIGHT: dict[str, float] = {
    "hirer": 1.0,
    "buyer": 0.9,
    "asker": 0.6,
    "unknown": 0.5,
}
