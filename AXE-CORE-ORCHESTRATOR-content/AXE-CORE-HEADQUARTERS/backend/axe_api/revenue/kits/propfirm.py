"""Prop-firm challenge rule guard — the tripwire deliverable.

Most funded-account challenges are failed on *rule breaches*, not on bad
trading: a daily-loss limit crossed by one trade, a trailing drawdown that
moved up after a good day and then caught a normal pullback. Those are
arithmetic failures, and arithmetic is fixable.

This computes, for a given firm's published rules and where the account stands
right now:

  • how much loss budget is left today, and in total, before the account fails
  • the largest position that cannot breach either limit given the stop
  • which limit is the binding one (people watch the wrong one)

It says nothing about what to trade. Position sizing from a stop the user chose
is arithmetic on their own inputs; a view on the trade would be advice, which
is a licensed activity and not what this is.

Stdlib only.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

# Published rules for the common challenge shapes. Values are fractions of the
# starting balance. Always re-read the firm's current rulebook: these change,
# and the firm's page is the authority, not this table.
FIRM_PRESETS: dict[str, dict[str, object]] = {
    "generic_2step": {
        "label": "Generic 2-step (10% target / 5% daily / 10% max)",
        "daily_loss": 0.05, "max_loss": 0.10, "profit_target": 0.10,
        "trailing": False, "drawdown_from": "balance",
    },
    "generic_1step": {
        "label": "Generic 1-step (8% target / 4% daily / 8% max)",
        "daily_loss": 0.04, "max_loss": 0.08, "profit_target": 0.08,
        "trailing": False, "drawdown_from": "balance",
    },
    "trailing_equity": {
        "label": "Trailing drawdown from peak equity (5% daily / 6% trailing)",
        "daily_loss": 0.05, "max_loss": 0.06, "profit_target": 0.09,
        "trailing": True, "drawdown_from": "peak_equity",
    },
}


class RuleError(ValueError):
    """The inputs cannot describe a real account state."""


@dataclass
class Rules:
    starting_balance: float
    daily_loss_pct: float          # e.g. 0.05 = 5% of starting balance
    max_loss_pct: float            # total drawdown allowance
    profit_target_pct: float = 0.0
    trailing: bool = False         # does max loss trail the equity peak?
    label: str = "custom"

    @classmethod
    def from_preset(cls, name: str, starting_balance: float) -> "Rules":
        if name not in FIRM_PRESETS:
            raise RuleError(f"unknown preset '{name}'. Known: {', '.join(sorted(FIRM_PRESETS))}")
        p = FIRM_PRESETS[name]
        return cls(
            starting_balance=starting_balance,
            daily_loss_pct=float(p["daily_loss"]),        # type: ignore[arg-type]
            max_loss_pct=float(p["max_loss"]),            # type: ignore[arg-type]
            profit_target_pct=float(p["profit_target"]),  # type: ignore[arg-type]
            trailing=bool(p["trailing"]),
            label=str(p["label"]),
        )


@dataclass
class AccountState:
    equity: float                       # right now
    day_start_equity: float             # equity at the session reset
    peak_equity: Optional[float] = None  # high-water mark, for trailing rules

    def __post_init__(self) -> None:
        if self.equity <= 0 or self.day_start_equity <= 0:
            raise RuleError("equity and day_start_equity must both be positive")
        if self.peak_equity is None:
            self.peak_equity = max(self.equity, self.day_start_equity)


def assess(rules: Rules, state: AccountState) -> dict:
    """Where the account stands against each limit right now."""
    daily_allowance = rules.starting_balance * rules.daily_loss_pct
    daily_floor = state.day_start_equity - daily_allowance
    daily_remaining = state.equity - daily_floor

    if rules.trailing:
        overall_floor = (state.peak_equity or state.equity) * (1 - rules.max_loss_pct)
        floor_basis = "trailing from peak equity"
    else:
        overall_floor = rules.starting_balance * (1 - rules.max_loss_pct)
        floor_basis = "fixed from starting balance"
    overall_remaining = state.equity - overall_floor

    binding = "daily" if daily_remaining <= overall_remaining else "overall"
    headroom = max(min(daily_remaining, overall_remaining), 0.0)

    target_equity = rules.starting_balance * (1 + rules.profit_target_pct)
    warnings: list[str] = []
    if daily_remaining <= 0:
        warnings.append("DAILY LIMIT ALREADY BREACHED at current equity")
    if overall_remaining <= 0:
        warnings.append("MAX DRAWDOWN ALREADY BREACHED at current equity")
    if 0 < headroom <= daily_allowance * 0.25:
        warnings.append(
            f"only {headroom/daily_allowance*100:.0f}% of one day's allowance left before the "
            f"{binding} limit"
        )
    if rules.trailing and (state.peak_equity or 0) > state.equity:
        warnings.append(
            "trailing rule: the floor moved up with your equity peak and does not move back down"
        )

    return {
        "rules": rules.label,
        "starting_balance": round(rules.starting_balance, 2),
        "equity": round(state.equity, 2),
        "daily": {
            "allowance": round(daily_allowance, 2),
            "floor": round(daily_floor, 2),
            "remaining": round(daily_remaining, 2),
            "used_pct": round(
                max(state.day_start_equity - state.equity, 0) / daily_allowance, 4
            ) if daily_allowance else 0.0,
        },
        "overall": {
            "floor": round(overall_floor, 2),
            "floor_basis": floor_basis,
            "remaining": round(overall_remaining, 2),
            "peak_equity": round(state.peak_equity or state.equity, 2),
        },
        "binding_limit": binding,
        "headroom": round(headroom, 2),
        "profit_target": {
            "equity_needed": round(target_equity, 2),
            "remaining": round(max(target_equity - state.equity, 0), 2),
        } if rules.profit_target_pct else None,
        "warnings": warnings,
    }


def max_position(
    rules: Rules,
    state: AccountState,
    stop_distance: float,
    value_per_point: float = 1.0,
    risk_fraction: float = 1.0,
) -> dict:
    """Largest position whose full stop-out still cannot breach either limit.

    `stop_distance` is in price units, `value_per_point` is what one point of
    price movement is worth per unit of size (1.0 for a cash instrument sized
    in units; the contract/pip value for futures and FX).

    `risk_fraction` is how much of the remaining headroom you are willing to
    spend on this one trade — 1.0 means "a single stop-out takes me exactly to
    the limit", which is why the default output also shows the more survivable
    fractions.
    """
    if stop_distance <= 0:
        raise RuleError("stop_distance must be greater than zero — no stop, no size")
    if value_per_point <= 0:
        raise RuleError("value_per_point must be greater than zero")
    if not 0 < risk_fraction <= 1:
        raise RuleError("risk_fraction must be between 0 and 1")

    snapshot = assess(rules, state)
    headroom = snapshot["headroom"]
    risk_budget = headroom * risk_fraction
    per_unit_risk = stop_distance * value_per_point
    size = risk_budget / per_unit_risk if per_unit_risk else 0.0

    ladder = {
        f"{int(f*100)}% of headroom": {
            "risk": round(headroom * f, 2),
            "size": round((headroom * f) / per_unit_risk, 4),
            "stop_outs_before_limit": int(1 / f) if f else 0,
        }
        for f in (1.0, 0.5, 0.33, 0.25, 0.1)
    }

    return {
        **snapshot,
        "stop_distance": stop_distance,
        "value_per_point": value_per_point,
        "risk_per_unit": round(per_unit_risk, 6),
        "risk_budget": round(risk_budget, 2),
        "max_size": round(size, 4),
        "sizing_ladder": ladder,
    }


def report(result: dict, currency: str = "$") -> str:
    """The one-page output the buyer actually reads."""
    d, o = result["daily"], result["overall"]
    lines = [
        f"# Challenge guard — {result['rules']}",
        "",
        f"Equity **{currency}{result['equity']:,.2f}** on a "
        f"{currency}{result['starting_balance']:,.2f} account.",
        "",
        "## Where the floors are",
        "",
        f"| limit | floor | remaining |",
        f"|---|---:|---:|",
        f"| daily (resets at session start) | {currency}{d['floor']:,.2f} | **{currency}{d['remaining']:,.2f}** |",
        f"| overall ({o['floor_basis']}) | {currency}{o['floor']:,.2f} | **{currency}{o['remaining']:,.2f}** |",
        "",
        f"Binding limit right now: **{result['binding_limit']}** — "
        f"{currency}{result['headroom']:,.2f} of headroom. "
        f"That is the number to watch; the other one is slack.",
        "",
    ]
    if result.get("profit_target"):
        p = result["profit_target"]
        lines += [
            f"Profit target: {currency}{p['equity_needed']:,.2f} equity "
            f"({currency}{p['remaining']:,.2f} to go).",
            "",
        ]
    if "sizing_ladder" in result:
        lines += [
            "## Position sizing on your stop",
            "",
            f"Stop distance {result['stop_distance']} × {currency}{result['value_per_point']} "
            f"per point = {currency}{result['risk_per_unit']:,.2f} risk per unit of size.",
            "",
            "| risk taken | money at risk | position size | stop-outs before the limit |",
            "|---|---:|---:|---:|",
        ]
        for label, row in result["sizing_ladder"].items():
            lines.append(
                f"| {label} | {currency}{row['risk']:,.2f} | {row['size']:,.4f} | "
                f"{row['stop_outs_before_limit']} |"
            )
        lines += [
            "",
            "The right-hand column is the whole point: sizing to 100% of headroom "
            "means one stop-out ends the account.",
            "",
        ]
    if result["warnings"]:
        lines += ["## Warnings", ""] + [f"- **{w}**" for w in result["warnings"]] + [""]
    lines += [
        "---",
        "",
        "Arithmetic on the rules and equity you entered. Not trading advice, and "
        "not a substitute for your firm's current rulebook — verify the "
        "percentages against their page before relying on this.",
        "",
    ]
    return "\n".join(lines)
