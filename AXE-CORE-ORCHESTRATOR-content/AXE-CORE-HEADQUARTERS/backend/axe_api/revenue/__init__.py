"""Demand Fusion Engine — AXE's revenue loop.

What this is: a deterministic pipeline that turns *public evidence that people
are already paying to solve a problem* into a priced micro-offer ladder, a
distribution plan, and a ledger that decides what to kill and what to multiply.

    harvest → fuse → stack → distribute → measure → reallocate → (repeat)

Three design rules it will not break, because breaking them is how these
systems die:

1. **No invented demand.** Every cluster traces back to signal records with a
   source URL. `fuse()` cannot manufacture a signal; if the harvest is empty
   the loop reports empty, not optimistic.
2. **No invented money.** The ledger only knows revenue that was recorded as
   settled. Projections (`project_to_target`) refuse to return a number until
   there are enough real data points, and they carry the sample size with
   them. A $9K figure in this system is always "here is what the observed
   conversion implies", never a promise.
3. **Faceless, not fake.** "Stealth" here means no personal brand is required —
   the operator stays anonymous behind a product name. It does not mean
   sockpuppets, undisclosed promotion, or evading platform rules:
   `distribution.validate_asset()` hard-fails an asset that is missing a
   required disclosure or that tries to run a second identity on a channel.

Everything except `signals.harvest_live()` runs offline and deterministically,
so the whole engine is testable without a network or an API key.
"""

from .models import (  # noqa: F401
    DemandCluster,
    DemandSignal,
    DistributionAsset,
    LedgerEntry,
    LoopReport,
    OfferStack,
    OfferTier,
)

__all__ = [
    "DemandSignal",
    "DemandCluster",
    "OfferTier",
    "OfferStack",
    "DistributionAsset",
    "LedgerEntry",
    "LoopReport",
]
