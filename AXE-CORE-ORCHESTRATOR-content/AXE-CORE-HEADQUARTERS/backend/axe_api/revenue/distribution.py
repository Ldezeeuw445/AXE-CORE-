"""Silent distribution — getting the offer in front of people without a face,
an audience, or an ad budget.

"Silent" means the operator is not the product: no personal brand, no talking
head, no follower count required. The channels here all work for a stranger
with a laptop, because they are places where someone is *already looking for
this answer today*.

It does not mean hidden, and the code enforces that distinction:

* `CHANNELS[...].requires_disclosure` → an asset that promotes your own paid
  thing must say so, in the asset itself. `validate_asset()` fails it otherwise.
  This is the FTC endorsement rule and the house rule of every forum on the
  list; it is also the only version of this that survives contact with a
  moderator.
* One identity per channel. `validate_plan()` fails a plan that runs two
  handles on the same channel. Sockpuppets are the single fastest way to lose
  the accounts this whole engine runs on.
* `BANNED_CLAIMS` — earnings promises, "guaranteed", "risk-free". Unprovable
  claims are what turns a refund into a chargeback and a chargeback into a
  closed payment account.

Rate caps are per-channel and deliberately conservative. The bottleneck for a
solo operator is never "how many posts can I write", it is "how many places
will still have me next week".
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable, Optional, Sequence
from urllib.parse import urlencode, urlsplit, urlunsplit

from .models import DistributionAsset, OfferStack, OfferTier, stable_id


@dataclass(frozen=True)
class Channel:
    name: str
    kind: str                     # answer | listing | video | email | page | community
    daily_cap: int                # assets per day, conservative on purpose
    requires_disclosure: bool
    allows_link: bool
    max_chars: int
    warmup: str                   # what you must do before posting the first offer
    notes: str
    # Reach required before the ledger is allowed to call this channel dead.
    # Compounding channels (a page, a free tool) earn nothing for weeks and
    # then earn while you sleep; judging them on the same sample as a forum
    # answer kills exactly the assets that would have carried month three.
    kill_min_reach: int = 300


CHANNELS: dict[str, Channel] = {
    "forum_answer": Channel(
        name="forum_answer", kind="answer", daily_cap=5, requires_disclosure=True,
        allows_link=True, max_chars=4000,
        warmup="Answer 5 questions with no link at all before the first one that mentions your offer.",
        notes="Reddit/HN/StackExchange/Lemmy. The answer must stand alone if the link is removed.",
    ),
    "community_dm": Channel(
        name="community_dm", kind="community", daily_cap=10, requires_disclosure=True,
        allows_link=True, max_chars=1200,
        warmup="Only DM people who publicly asked this exact question, and reference their post.",
        notes="Discord/Slack communities. Unsolicited bulk DMs get the account and the offer killed.",
    ),
    "marketplace_listing": Channel(
        name="marketplace_listing", kind="listing", daily_cap=3, requires_disclosure=False,
        allows_link=True, max_chars=5000,
        warmup="Complete the seller profile fully — sparse profiles do not rank.",
        notes="Gumroad/Fiverr/Upwork/Etsy. The platform IS the disclosure; you are obviously selling.",
    ),
    "faceless_video": Channel(
        name="faceless_video", kind="video", daily_cap=2, requires_disclosure=True,
        allows_link=True, max_chars=1500,
        warmup="Three pure-teaching clips before the first one with an offer in the description.",
        notes="Screen-recording shorts. No voice or face needed; the artifact on screen is the hook.",
    ),
    "cold_email": Channel(
        name="cold_email", kind="email", daily_cap=20, requires_disclosure=True,
        allows_link=True, max_chars=1500,
        warmup="Warm the sending domain for 2+ weeks; never send from your main domain.",
        notes=(
            "Must carry a working unsubscribe line and a real postal address (CAN-SPAM), and "
            "recipients must have a genuine connection to the problem — scraped bulk lists are "
            "both illegal in most of the EU and the fastest way to burn the domain."
        ),
    ),
    "seo_page": Channel(
        name="seo_page", kind="page", daily_cap=2, requires_disclosure=False,
        allows_link=True, max_chars=8000,
        warmup="One page per exact question phrase; publish the answer above the offer.",
        notes="Your own site. Slowest to pay, only asset that compounds while you sleep.",
        kill_min_reach=5000,
    ),
    "free_tool": Channel(
        name="free_tool", kind="page", daily_cap=1, requires_disclosure=False,
        allows_link=True, max_chars=3000,
        warmup="Ship the tool working and free before mentioning any paid rung.",
        notes=(
            "A tiny hosted tool that does the first 20% of the job. Highest-converting "
            "'silent' asset there is: it proves competence before asking for money."
        ),
        kill_min_reach=3000,
    ),
}

# Claims that are unprovable, and therefore not worth the account, the
# chargeback, or the regulator.
BANNED_CLAIMS = [
    r"\bguarantee[ds]?\b",
    r"\brisk[- ]free\b",
    r"\bpassive income\b",
    r"\bmake \$?\d+[km]?\b",
    r"\bearn \$?\d+[km]?\b",
    r"\bovernight\b",
    r"\b100% (?:success|results?|effective)\b",
    r"\bno effort\b",
]

DEFAULT_DISCLOSURE = "Disclosure: I built this and I sell it — the free version below stands on its own."
UNSUBSCRIBE_LINE = "Reply STOP or click unsubscribe and I will never email you again."


class DistributionError(ValueError):
    """Raised when an asset or plan breaks a channel's hard rules."""


# ── tracked links ─────────────────────────────────────────────────────────────

def tracked_url(base_url: str, channel: str, offer_id: str, tier_id: str) -> str:
    """UTM-tagged link. Attribution is not optional here: the reallocation maths
    in ledger.py is only as good as knowing which channel a sale came from."""
    if not base_url:
        return ""
    parts = urlsplit(base_url)
    params = urlencode(
        {
            "utm_source": channel,
            "utm_medium": "silent",
            "utm_campaign": offer_id,
            "utm_content": tier_id,
        }
    )
    query = f"{parts.query}&{params}" if parts.query else params
    return urlunsplit((parts.scheme, parts.netloc, parts.path, query, parts.fragment))


# ── asset generation ──────────────────────────────────────────────────────────

def _answer_body(tier: OfferTier, stack: OfferStack, question: str) -> str:
    steps = "\n".join(f"{i}. {d}" for i, d in enumerate(tier.deliverables[:3], 1))
    return (
        f"Short answer: most of the time this is one of five things, and you can tell "
        f"which in about ten minutes.\n\n"
        f"What actually works, in order:\n{steps}\n\n"
        f"That is the whole method — you can do all of it yourself from the above and "
        f"never spend a cent.\n\n"
        f"If you would rather not assemble it, I packaged exactly this as "
        f"“{tier.name}” ({tier.promise})."
    )


def _listing_body(tier: OfferTier, stack: OfferStack) -> str:
    lines = "\n".join(f"• {d}" for d in tier.deliverables)
    return (
        f"{tier.promise}\n\nWhat you get:\n{lines}\n\n"
        f"Who it is for: {stack.positioning}\n\n"
        f"Refunds: {tier.refund_policy}. Delivery: instant download, "
        f"typical setup time {tier.fulfillment_minutes} minutes."
    )


def _video_body(tier: OfferTier, stack: OfferStack) -> str:
    beats = "\n".join(f"{i}. {d}" for i, d in enumerate(tier.deliverables[:3], 1))
    return (
        "SCREEN-RECORDING SCRIPT (no face, no voice needed — captions on screen)\n\n"
        "0:00 Show the broken output. No intro, no greeting.\n"
        "0:03 Caption: the exact sentence a real person wrote about this problem.\n"
        f"0:06 Fix it live on screen:\n{beats}\n"
        "0:35 Show the working output next to the broken one.\n"
        "0:40 Caption: 'full checklist in the description'.\n\n"
        f"Description: {tier.promise} — {tier.name}."
    )


def _email_body(tier: OfferTier, stack: OfferStack, question: str, postal_address: str) -> str:
    return (
        f"You wrote about “{question}” recently — "
        f"if it is still open, here is the short version of the fix:\n\n"
        f"• {tier.deliverables[0]}\n"
        f"• {tier.deliverables[1] if len(tier.deliverables) > 1 else 'Run it once on a copy of your data first.'}\n\n"
        f"That is genuinely the whole thing; use it and ignore the rest of this email.\n\n"
        f"If you want it done rather than described, I sell it as {tier.name}. "
        f"{tier.promise}\n\n"
        f"{UNSUBSCRIBE_LINE}\n"
        f"{postal_address}"
    )


def _page_body(tier: OfferTier, stack: OfferStack, question: str) -> str:
    lines = "\n".join(f"- {d}" for d in tier.deliverables)
    return (
        f"# {question}\n\n"
        f"The full answer, free, no email required:\n\n{lines}\n\n"
        f"## Want it prebuilt?\n{tier.name} — {tier.promise} ({tier.refund_policy}.)"
    )


def build_asset(
    channel: str,
    stack: OfferStack,
    tier: OfferTier,
    question: str,
    base_url: str,
    identity: str,
    disclosure: Optional[str] = None,
    postal_address: str = "",
) -> DistributionAsset:
    """One asset for one channel. Content is deterministic scaffolding — the
    operator (or an LLM pass) fills the specifics. What matters here is that
    the compliance fields are attached at construction, not bolted on later."""
    if channel not in CHANNELS:
        raise DistributionError(f"unknown channel '{channel}'. Known: {', '.join(sorted(CHANNELS))}")
    ch = CHANNELS[channel]

    if ch.kind == "email" and not postal_address.strip():
        # Not a nag: a commercial email without a physical postal address is
        # illegal to send in the US (CAN-SPAM), so there is no point generating
        # the body and pretending it is ready.
        raise DistributionError(
            "cold_email needs postal_address= (a real mailing address is legally "
            "required in commercial email; a virtual mailbox is fine)"
        )

    builders = {
        "answer": lambda: _answer_body(tier, stack, question),
        "community": lambda: _answer_body(tier, stack, question),
        "listing": lambda: _listing_body(tier, stack),
        "video": lambda: _video_body(tier, stack),
        "email": lambda: _email_body(tier, stack, question, postal_address),
        "page": lambda: _page_body(tier, stack, question),
    }
    body = builders[ch.kind]()
    link = tracked_url(base_url, channel, stack.id, tier.id) if ch.allows_link else ""

    asset = DistributionAsset(
        id=stable_id("ast", channel, stack.id, tier.id, question),
        channel=channel,
        offer_id=stack.id,
        tier_id=tier.id,
        headline=question[:120],
        body=body,
        call_to_action=(f"{tier.promise} → {link}" if link else tier.promise),
        tracked_url=link,
        disclosure=(disclosure or DEFAULT_DISCLOSURE) if ch.requires_disclosure else "",
        identity=identity,
    )
    validate_asset(asset)  # never hand back an asset that would get you banned
    return asset


# ── validation ────────────────────────────────────────────────────────────────

def validate_asset(asset: DistributionAsset) -> None:
    """Hard rules. Raises DistributionError with everything that is wrong, so
    one call tells the operator the full list instead of one item at a time."""
    ch = CHANNELS.get(asset.channel)
    if ch is None:
        raise DistributionError(f"unknown channel '{asset.channel}'")

    problems: list[str] = []
    full_text = " ".join([asset.headline, asset.body, asset.call_to_action, asset.disclosure])

    if ch.requires_disclosure and not asset.disclosure.strip():
        problems.append(
            f"{ch.name} requires a disclosure on promotional content and this asset has none"
        )
    if not asset.identity.strip():
        problems.append("asset has no identity — every post must be attributable to one handle")
    if len(asset.body) > ch.max_chars:
        problems.append(f"body is {len(asset.body)} chars, over the {ch.max_chars} limit for {ch.name}")
    if asset.tracked_url and not ch.allows_link:
        problems.append(f"{ch.name} does not allow links but this asset carries one")

    for pattern in BANNED_CLAIMS:
        match = re.search(pattern, full_text, flags=re.IGNORECASE)
        if match:
            problems.append(f"unprovable claim in copy: '{match.group(0)}'")

    if ch.kind == "email":
        if "unsubscribe" not in full_text.lower() and "reply stop" not in full_text.lower():
            problems.append("cold email without an opt-out line (CAN-SPAM)")

    if problems:
        raise DistributionError("; ".join(problems))


def validate_plan(assets: Sequence[DistributionAsset]) -> list[str]:
    """Cross-asset rules: one identity per channel, and daily caps. Returns
    warnings rather than raising — a plan that is merely *too big* should be
    trimmed, not rejected."""
    warnings: list[str] = []

    identities: dict[str, set[str]] = {}
    counts: dict[str, int] = {}
    for a in assets:
        identities.setdefault(a.channel, set()).add(a.identity)
        counts[a.channel] = counts.get(a.channel, 0) + 1

    for channel, handles in identities.items():
        if len(handles) > 1:
            raise DistributionError(
                f"{channel} has {len(handles)} identities ({', '.join(sorted(handles))}) — "
                "one identity per channel. Multiple handles on one platform is sockpuppeting "
                "and it ends with every account gone."
            )

    for channel, n in counts.items():
        cap = CHANNELS[channel].daily_cap
        if n > cap:
            warnings.append(
                f"{channel}: {n} assets queued, daily cap is {cap} — spread the rest over "
                f"{-(-n // cap)} days."
            )

    return warnings


def build_plan(
    stack: OfferStack,
    questions: Sequence[str],
    identity: str,
    base_url: str,
    channels: Optional[Iterable[str]] = None,
    tier_rungs: Optional[Sequence[str]] = None,
    postal_address: str = "",
) -> tuple[list[DistributionAsset], list[str]]:
    """Assets for the whole ladder across the chosen channels.

    `questions` should be the real sentences from the cluster's evidence — the
    closer the headline is to what someone actually typed, the less this reads
    like marketing and the more it reads like an answer.
    """
    picked_channels = list(channels or ["forum_answer", "marketplace_listing", "free_tool", "seo_page"])
    rungs = list(tier_rungs or ["tripwire", "core"])
    tiers = [t for t in stack.tiers if t.rung in rungs] or stack.tiers[:1]

    assets: list[DistributionAsset] = []
    errors: list[str] = []
    prompts = list(questions) or [stack.positioning]
    for channel in picked_channels:
        if channel not in CHANNELS:
            errors.append(f"unknown channel '{channel}' skipped")
            continue
        # One day's worth per channel, never more: the cap is the plan, not a
        # suggestion to be exceeded and then apologised for in the warnings.
        todo = [(tier, q) for q in prompts for tier in tiers][: CHANNELS[channel].daily_cap]
        for tier, question in todo:
            try:
                assets.append(
                    build_asset(
                        channel, stack, tier, question, base_url, identity,
                        postal_address=postal_address,
                    )
                )
            except DistributionError as e:
                errors.append(f"{channel}/{tier.rung}: {e}")

    warnings = validate_plan(assets)
    return assets, warnings + errors


def channel_brief(channel: str) -> dict:
    """What the operator needs to know before touching this channel."""
    ch = CHANNELS[channel]
    return {
        "channel": ch.name,
        "kind": ch.kind,
        "daily_cap": ch.daily_cap,
        "requires_disclosure": ch.requires_disclosure,
        "warmup": ch.warmup,
        "notes": ch.notes,
    }
