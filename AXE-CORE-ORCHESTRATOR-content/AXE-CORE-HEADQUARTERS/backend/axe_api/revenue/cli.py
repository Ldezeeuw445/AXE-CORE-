"""Command line for the Demand Fusion Engine.

    python -m revenue.cli cycle --offline --identity axe_kits --url https://…
    python -m revenue.cli status
    python -m revenue.cli ledger-add --offer off_x --tier tier_y --channel forum_answer \
        --reach 800 --clicks 41 --sales 2 --revenue 3798
    python -m revenue.cli project

Runs entirely on the local JSON state file (`REVENUE_STATE_PATH`, default
~/.axe/revenue_state.json) — no server, no database, no keys.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from . import distribution, fusion, ledger, loop, offers, packs
from .kits import journal as kit_journal, propfirm as kit_propfirm, web as kit_web
from . import signals as harvesters
from .models import LedgerEntry, stable_id
from .store import JsonStore

DIV = "─" * 72


def _store(args) -> JsonStore:
    return JsonStore(Path(args.state) if args.state else None)


def _money(cents: int) -> str:
    return f"${cents/100:,.2f}"


# ── commands ──────────────────────────────────────────────────────────────────

def _queries(args) -> list[str]:
    """--query terms plus any --pack expansions, deduped, order preserved."""
    out = list(args.query or [])
    for name in getattr(args, "pack", None) or []:
        out.extend(packs.pack_queries(name))
    seen: set[str] = set()
    return [q for q in out if not (q in seen or seen.add(q))]


def cmd_kit_journal(args) -> int:
    """Run the trade-journal deliverable on a broker CSV."""
    path = Path(args.csv)
    if not path.exists():
        print(f"no such file: {path}", file=sys.stderr)
        return 1
    try:
        text = kit_journal.report_from_csv(path.read_text(encoding="utf-8", errors="replace"),
                                           currency=args.currency)
    except kit_journal.JournalError as e:
        print(f"could not read {path} as a trade journal: {e}", file=sys.stderr)
        return 1
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
        print(f"wrote {args.out}")
    else:
        print(text)
    return 0


def cmd_kit_propfirm(args) -> int:
    """Challenge rule arithmetic: floors, headroom and position sizing."""
    try:
        rules = (
            kit_propfirm.Rules.from_preset(args.preset, args.balance)
            if args.preset
            else kit_propfirm.Rules(
                starting_balance=args.balance,
                daily_loss_pct=args.daily_loss,
                max_loss_pct=args.max_loss,
                profit_target_pct=args.target,
                trailing=args.trailing,
            )
        )
        state = kit_propfirm.AccountState(
            equity=args.equity if args.equity is not None else args.balance,
            day_start_equity=args.day_start if args.day_start is not None else args.balance,
            peak_equity=args.peak,
        )
        result = (
            kit_propfirm.max_position(rules, state, args.stop, args.point_value)
            if args.stop
            else kit_propfirm.assess(rules, state)
        )
    except kit_propfirm.RuleError as e:
        print(f"cannot assess: {e}", file=sys.stderr)
        return 1
    print(json.dumps(result, indent=2) if args.json
          else kit_propfirm.report(result, currency=args.currency))
    return 0


def cmd_kit_web(args) -> int:
    """Render the free browser tool — one self-contained HTML file."""
    html = kit_web.render_page(
        product_name=args.name, currency=args.currency,
        offer_url=args.url or "", offer_label=args.label or "",
        disclosure=args.disclosure or "",
    )
    Path(args.out).write_text(html, encoding="utf-8")
    print(f"wrote {args.out} ({len(html):,} bytes, no external requests)")
    print("Host it anywhere static. The visitor's CSV is read in their browser and never uploaded.")
    return 0


def cmd_packs(args) -> int:
    for p in packs.describe_packs():
        print(f"{p['pack']}\n   {p['description']}")
        for q in p["queries"]:
            print(f"   · {q}")
    return 0


def cmd_harvest(args) -> int:
    store = _store(args)
    if args.offline:
        found = harvesters.harvest_offline()
        warnings: list[str] = ["offline mode: seed corpus, NOT live market evidence"]
    else:
        queries = _queries(args)
        if not queries:
            print("nothing to harvest: pass --offline, -q QUERY, or --pack NAME", file=sys.stderr)
            return 1
        found, warnings = asyncio.run(
            harvesters.harvest_live(queries, sources=args.source or None)
        )
    added = store.put_signals(found)
    store.save()
    print(f"harvested {len(found)} signals ({added} new) into {store.path}")
    for w in warnings:
        print(f"  ! {w}")
    return 0


def cmd_fuse(args) -> int:
    store = _store(args)
    clusters = fusion.fuse(store.signals(), now=datetime.now(timezone.utc))
    store.put_clusters(clusters)
    store.save()
    print(f"{len(clusters)} clusters from {len(store.signals())} signals\n{DIV}")
    for c in clusters:
        print(fusion.explain(c))
        for url in c.evidence_urls[:3]:
            print(f"      {url}")
    return 0


def cmd_offer(args) -> int:
    store = _store(args)
    clusters = store.clusters()
    if not clusters:
        print("no clusters — run `harvest` then `fuse` first", file=sys.stderr)
        return 1
    cluster = next((c for c in clusters if c.id == args.cluster), clusters[0])
    stack = offers.build_stack(cluster)
    store.put_offers([stack])
    store.save()

    print(f"{stack.product_name}  [{stack.id}]\n{stack.positioning}\n{DIV}")
    for t in stack.tiers:
        print(f"{t.rung:9s} {_money(t.price_cents):>10s}  {t.fulfillment_minutes:>4d}min "
              f" ({_money(t.hourly_cents)}/h effective)   {t.id}")
        for d in t.deliverables:
            print(f"           · {d}")
    problems = offers.audit_stack(stack)
    if problems:
        print(f"{DIV}\nSTACK AUDIT")
        for p in problems:
            print(f"  ! {p}")
    target = args.target or store.target_cents
    cvr = args.cvr if args.cvr and args.cvr > 0 else None
    print(f"{DIV}\nROUTES TO {_money(target)}"
          + ("" if cvr else "  (pass --cvr to see the reach each route needs)"))
    for r in offers.path_to_target(stack, target, conversion_rate=cvr):
        print("  · " + offers.describe_route(r, target))
    return 0


def cmd_plan(args) -> int:
    store = _store(args)
    stacks = store.offers()
    if not stacks:
        print("no offers — run `offer` first", file=sys.stderr)
        return 1
    stack = next((s for s in stacks if s.id == args.offer), stacks[0])
    clusters = {c.id: c for c in store.clusters()}
    cluster = clusters.get(stack.cluster_id)
    questions = loop._questions_for(cluster, store.signals()) if cluster else [stack.positioning]

    assets, warnings = distribution.build_plan(
        stack, questions, identity=args.identity, base_url=args.url,
        channels=args.channel or None, postal_address=args.postal_address,
    )
    store.put_assets(assets)
    store.save()

    print(f"{len(assets)} assets queued for {stack.product_name}\n{DIV}")
    for a in assets:
        print(f"[{a.channel}] {a.headline}")
        print(f"   → {a.tracked_url or '(no link on this channel)'}")
        if a.disclosure:
            print(f"   disclosure: {a.disclosure}")
    if warnings:
        print(f"{DIV}\nWARNINGS")
        for w in warnings:
            print(f"  ! {w}")
    if args.show:
        first = assets[0] if assets else None
        if first:
            print(f"{DIV}\n{first.body}\n\nCTA: {first.call_to_action}")
    return 0


def cmd_channels(args) -> int:
    for name in sorted(distribution.CHANNELS):
        brief = distribution.channel_brief(name)
        print(f"{name:22s} cap {brief['daily_cap']}/day  "
              f"disclosure {'required' if brief['requires_disclosure'] else 'n/a'}")
        print(f"   warm-up: {brief['warmup']}")
        print(f"   {brief['notes']}")
    return 0


def cmd_ledger_add(args) -> int:
    store = _store(args)
    entry = LedgerEntry(
        id=stable_id("led", args.offer, args.tier, args.channel, args.at or ""),
        offer_id=args.offer,
        tier_id=args.tier,
        channel=args.channel,
        reach=args.reach,
        clicks=args.clicks,
        sales=args.sales,
        revenue_cents=args.revenue,
        cost_cents=args.cost,
        effort_minutes=args.minutes,
        note=args.note or "",
        occurred_at=args.at or datetime.now(timezone.utc).isoformat(),
    )
    store.put_ledger([entry])
    store.save()
    print(f"recorded {entry.id}: {entry.channel} → {entry.sales} sale(s), {_money(entry.revenue_cents)}")
    return 0


def cmd_cycle(args) -> int:
    store = _store(args)
    warnings: list[str] = []
    if args.offline:
        found = harvesters.harvest_offline()
        warnings.append("offline mode: seed corpus, NOT live market evidence")
    elif _queries(args):
        found, warnings = asyncio.run(
            harvesters.harvest_live(_queries(args), sources=args.source or None)
        )
    else:
        found = []
        warnings.append("no --query/--pack and no --offline: reusing stored signals only")

    report = loop.run_cycle(
        store,
        new_signals=found,
        identity=args.identity or "",
        base_url=args.url or "",
        channels=args.channel or None,
        effort_units=args.effort,
        warnings=warnings,
    )
    if args.json:
        print(json.dumps(report.to_dict(), indent=2))
        return 0

    print(f"CYCLE {report.cycle} — {report.ran_at}\n{DIV}")
    print(f"signals +{report.signals_harvested}   clusters {report.clusters_formed}   "
          f"offers {report.offers_built}   assets {report.assets_queued}")
    print(f"revenue {_money(report.revenue_cents_to_date)} / {_money(report.target_cents)} "
          f"({report.target_progress*100:.0f}%)")
    if report.next_actions:
        print(f"{DIV}\nDO THIS NEXT")
        for i, a in enumerate(report.next_actions, 1):
            print(f"{i}. {a}")
    if report.warnings:
        print(f"{DIV}\nWARNINGS")
        for w in report.warnings:
            print(f"  ! {w}")
    return 0


def cmd_status(args) -> int:
    store = _store(args)
    st = loop.status(store)
    if args.json:
        print(json.dumps(st, indent=2))
        return 0
    t = st["totals"]
    print(f"cycle {st['cycle']}   revenue {_money(t['revenue_cents'])} "
          f"({st['progress_to_first_target']*100:.0f}% of {_money(st['targets']['first_cents'])})")
    print(f"reach {t['reach']:,}  clicks {t['clicks']:,}  sales {t['sales']}  "
          f"effort {t['effort_hours']}h  → {_money(t['revenue_per_hour_cents'])}/h")
    if st["top_clusters"]:
        print(f"{DIV}\nTOP DEMAND")
        for c in st["top_clusters"]:
            print("  " + c["explanation"])
    if st["decisions"]:
        print(f"{DIV}\nDECISIONS")
        for d in st["decisions"]:
            print(f"  {d['decision'].upper():18s} {d['channel']:20s} {d['reason']}")
    if st["allocation"]:
        print(f"{DIV}\nNEXT CYCLE EFFORT")
        for a in st["allocation"]:
            print(f"  {a['units']:>3d} units  {a['channel']:20s} ({a['role']})")
    print(f"{DIV}\n{st['projection']['message']}")
    return 0


def cmd_project(args) -> int:
    store = _store(args)
    result = ledger.project_to_target(
        store.ledger(), args.target or store.scale_target_cents
    )
    print(json.dumps(result, indent=2) if args.json else result["message"])
    return 0


# ── wiring ────────────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="revenue", description=__doc__)
    p.add_argument("--state", help="path to the JSON state file")
    sub = p.add_subparsers(dest="cmd", required=True)

    h = sub.add_parser("harvest", help="pull demand signals")
    h.add_argument("--offline", action="store_true", help="use the bundled seed corpus")
    h.add_argument("-q", "--query", action="append", default=[])
    h.add_argument("-s", "--source", action="append", default=[],
                   choices=sorted(harvesters.HARVESTERS))
    h.add_argument("-p", "--pack", action="append", default=[],
                   choices=sorted(packs.PACKS), help="curated query pack for a domain")
    h.set_defaults(func=cmd_harvest)

    pk = sub.add_parser("packs", help="list the curated query packs")
    pk.set_defaults(func=cmd_packs)

    kj = sub.add_parser("kit-journal", help="trade journal report from a broker CSV")
    kj.add_argument("--csv", required=True, help="path to the broker's closed-trades export")
    kj.add_argument("--out", help="write the markdown report here instead of stdout")
    kj.add_argument("--currency", default="$")
    kj.set_defaults(func=cmd_kit_journal)

    kp = sub.add_parser("kit-propfirm", help="challenge rule guard and position sizing")
    kp.add_argument("--balance", type=float, required=True, help="starting balance")
    kp.add_argument("--preset", choices=sorted(kit_propfirm.FIRM_PRESETS),
                    help="a published rule shape; omit to pass the percentages yourself")
    kp.add_argument("--daily-loss", type=float, default=0.05, dest="daily_loss")
    kp.add_argument("--max-loss", type=float, default=0.10, dest="max_loss")
    kp.add_argument("--target", type=float, default=0.10)
    kp.add_argument("--trailing", action="store_true", help="max loss trails the equity peak")
    kp.add_argument("--equity", type=float, help="equity right now (default: balance)")
    kp.add_argument("--day-start", type=float, dest="day_start",
                    help="equity at session reset (default: balance)")
    kp.add_argument("--peak", type=float, help="high-water equity, for trailing rules")
    kp.add_argument("--stop", type=float, help="stop distance in price units → sizing table")
    kp.add_argument("--point-value", type=float, default=1.0, dest="point_value")
    kp.add_argument("--currency", default="$")
    kp.add_argument("--json", action="store_true")
    kp.set_defaults(func=cmd_kit_propfirm)

    kw = sub.add_parser("kit-web", help="render the free browser journal tool (single HTML file)")
    kw.add_argument("--out", required=True, help="where to write the .html file")
    kw.add_argument("--name", default="Trade Journal Report", help="product name shown as the title")
    kw.add_argument("--url", help="link to the paid rung, shown after the tool has delivered")
    kw.add_argument("--label", help="link text for --url")
    kw.add_argument("--disclosure", default=distribution.DEFAULT_DISCLOSURE)
    kw.add_argument("--currency", default="$")
    kw.set_defaults(func=cmd_kit_web)

    f = sub.add_parser("fuse", help="cluster and rank stored signals")
    f.set_defaults(func=cmd_fuse)

    o = sub.add_parser("offer", help="build the micro-offer ladder for a cluster")
    o.add_argument("--cluster", help="cluster id (default: highest scoring)")
    o.add_argument("--target", type=int, help="target in cents (default: state target)")
    o.add_argument("--cvr", type=float, help="observed click→sale rate, e.g. 0.012")
    o.set_defaults(func=cmd_offer)

    pl = sub.add_parser("plan", help="generate distribution assets")
    pl.add_argument("--offer", help="offer stack id (default: first)")
    pl.add_argument("--identity", required=True, help="the single handle you post under")
    pl.add_argument("--url", required=True, help="destination URL for tracked links")
    pl.add_argument("-c", "--channel", action="append", default=[],
                    choices=sorted(distribution.CHANNELS))
    pl.add_argument("--postal-address", default="", dest="postal_address",
                    help="required for cold_email (CAN-SPAM)")
    pl.add_argument("--show", action="store_true", help="print the first asset in full")
    pl.set_defaults(func=cmd_plan)

    ch = sub.add_parser("channels", help="channel rules, caps and warm-up requirements")
    ch.set_defaults(func=cmd_channels)

    la = sub.add_parser("ledger-add", help="record a measured result")
    la.add_argument("--offer", required=True)
    la.add_argument("--tier", required=True)
    la.add_argument("--channel", required=True, choices=sorted(distribution.CHANNELS))
    la.add_argument("--reach", type=int, default=0)
    la.add_argument("--clicks", type=int, default=0)
    la.add_argument("--sales", type=int, default=0)
    la.add_argument("--revenue", type=int, default=0, help="settled revenue in cents")
    la.add_argument("--cost", type=int, default=0)
    la.add_argument("--minutes", type=int, default=0, help="your delivery + posting time")
    la.add_argument("--note", default="")
    la.add_argument("--at", help="ISO timestamp (default: now)")
    la.set_defaults(func=cmd_ledger_add)

    cy = sub.add_parser("cycle", help="run one full loop")
    cy.add_argument("--offline", action="store_true")
    cy.add_argument("-q", "--query", action="append", default=[])
    cy.add_argument("-s", "--source", action="append", default=[],
                    choices=sorted(harvesters.HARVESTERS))
    cy.add_argument("-p", "--pack", action="append", default=[],
                    choices=sorted(packs.PACKS), help="curated query pack for a domain")
    cy.add_argument("--identity", help="handle you post under")
    cy.add_argument("--url", help="destination URL for tracked links")
    cy.add_argument("-c", "--channel", action="append", default=[],
                    choices=sorted(distribution.CHANNELS))
    cy.add_argument("--effort", type=int, default=10, help="effort units to allocate")
    cy.add_argument("--json", action="store_true")
    cy.set_defaults(func=cmd_cycle)

    st = sub.add_parser("status", help="dashboard")
    st.add_argument("--json", action="store_true")
    st.set_defaults(func=cmd_status)

    pr = sub.add_parser("project", help="projection toward the scale target")
    pr.add_argument("--target", type=int, help="target in cents (default: scale target)")
    pr.add_argument("--json", action="store_true")
    pr.set_defaults(func=cmd_project)

    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except BrokenPipeError:
        # `revenue fuse | head` closes the pipe early. That is a normal way to
        # read this output, not an error worth a traceback.
        try:
            sys.stdout.close()
        finally:
            return 0
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
